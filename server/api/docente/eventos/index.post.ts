// server/api/docente/eventos/index.post.ts
import prisma from "~/lib/prisma";
import { Rol } from "@prisma/client";
import {
  defineEventHandler,
  createError,
  getRequestHeader,
  readBody,
  H3Event,
} from "h3";
import jwt from "jsonwebtoken";


export default defineEventHandler(async (event: H3Event) => {
  try {
    // Obtener el token del encabezado de autorización
    const authHeader = getRequestHeader(event, "authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw createError({
        statusCode: 401,
        message: "No se proporcionó un token de autenticación válido",
      });
    }
    const token = authHeader.split(" ")[1];

    // Verificar que JWT_SECRET existe
    if (!process.env.JWT_SECRET) {
      throw createError({
        statusCode: 500,
        message:
          "Error de configuración del servidor: JWT_SECRET no está definido",
      });
    }

    // Decodificar el token para obtener el ID del usuario
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET) as {
        userId: number;
        role: string;
        email: string;
      };
    } catch (jwtError) {
      console.error("Error al verificar el token:", jwtError);
      throw createError({
        statusCode: 401,
        message: "Token inválido o expirado",
      });
    }

    // Obtener los datos del cuerpo de la solicitud
    const body = await readBody(event);
    const { title, description, date, asignaturaId, importance } = body;

    // Validar los campos requeridos
    if (!title || !description || !date || !asignaturaId || !importance) {
      throw createError({
        statusCode: 400,
        message: "Faltan campos requeridos",
      });
    }

    // Buscar al usuario en la base de datos
    const usuario = await prisma.usuario.findUnique({
      where: {
        id: decodedToken.userId,
      },
    });

    if (!usuario) {
      throw createError({
        statusCode: 404,
        message: "Usuario no encontrado",
      });
    }

    // Verificar si el usuario tiene permisos para crear recordatorios
    if (usuario.rol !== Rol.DOCENTE && usuario.rol !== Rol.ADMIN) {
      throw createError({
        statusCode: 403,
        message: "El usuario no tiene permisos para crear recordatorios",
      });
    }

    // Verificar si la asignatura existe y está activa
    const asignatura = await prisma.asignatura.findFirst({
      where: {
        id: Number.parseInt(asignaturaId.toString()),
        activo: true,
      },
    });

    if (!asignatura) {
      throw createError({
        statusCode: 404,
        message: "Asignatura no encontrada o no está activa",
      });
    }

    // Si el usuario es DOCENTE, verificar que la asignatura le pertenece
    if (usuario.rol === Rol.DOCENTE) {
      const tienePermiso = await prisma.asignatura.findFirst({
        where: {
          id: asignatura.id,
          idDocente: usuario.id,
        },
      });
      if (!tienePermiso) {
        throw createError({
          statusCode: 403,
          message:
            "No tienes permiso para crear recordatorios en esta asignatura",
        });
      }
    }

    // Crear el nuevo recordatorio
    const newRecordatorio = await prisma.recordatorio.create({
      data: {
        titulo: title,
        descripcion: description,
        fecha: new Date(date),
        importancia: importance,
        asignaturaId: asignatura.id,
        creadoPorId: usuario.id,
      },
    });

    return newRecordatorio;
  } catch (error: unknown) {
    console.error("Error detallado:", error);

    if (error instanceof Error) {
      const statusCode = (error as any).statusCode || 500;
      throw createError({
        statusCode,
        message: error.message,
      });
    } else {
      throw createError({
        statusCode: 500,
        message: "Error desconocido al crear el recordatorio",
      });
    }
  }
});
