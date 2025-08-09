// server/api/students/calendar.get.ts
import prisma from "~/lib/prisma";
import { defineEventHandler, createError, getRequestHeader } from "h3";
import jwt from "jsonwebtoken";


export default defineEventHandler(async (event) => {
  try {
    // 1. Obtener el token de la cabecera de autorización
    const authHeader = getRequestHeader(event, "authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw createError({
        statusCode: 401,
        message: "No se proporcionó un token de autenticación válido",
      });
    }
    const token = authHeader.split(" ")[1];

    // Usar un fallback si no se define JWT_SECRET
    const secret = process.env.JWT_SECRET || "fallback_secret";

    // 2. Decodificar el token para obtener el ID del estudiante
    let decodedToken: any;
    try {
      decodedToken = jwt.verify(token, secret);
    } catch (error) {
      throw createError({
        statusCode: 401,
        message: "Token inválido o expirado",
      });
    }

    // 3. Buscar al estudiante correspondiente usando el ID obtenido del token
    const estudiante = await prisma.estudiante.findUnique({
      where: { id: decodedToken.userId },
      include: {
        asignatura: {
          include: {
            recordatorios: {
              orderBy: {
                fecha: "asc",
              },
              select: {
                id: true,
                titulo: true,
                descripcion: true,
                fecha: true,
                asignatura: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!estudiante) {
      return {
        eventos: [],
        asignaturas: [],
      };
    }

    // Transformar los recordatorios al formato esperado
    const eventos = estudiante.asignatura.recordatorios.map((recordatorio) => ({
      id: recordatorio.id,
      title: recordatorio.titulo,
      date: recordatorio.fecha.toISOString(),
      description: recordatorio.descripcion,
      asignatura: {
        id: recordatorio.asignatura.id,
        nombre: recordatorio.asignatura.nombre,
      },
    }));

    // Obtener la asignatura a la que está registrado el estudiante
    const asignaturas = [
      {
        id: estudiante.asignatura.id,
        nombre: estudiante.asignatura.nombre,
      },
    ];

    return {
      eventos,
      asignaturas,
    };
  } catch (error) {
    console.error("Error al obtener eventos del calendario:", error);
    throw createError({
      statusCode: 500,
      message: "Error al obtener los eventos del calendario",
      cause: error,
    });
  }
});
