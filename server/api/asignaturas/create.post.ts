import prisma from "~/lib/prisma";
import {
  H3Event,
  defineEventHandler,
  readBody,
  createError,
  getHeader,
} from "h3";
import jwt from "jsonwebtoken";


export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody(event);

  console.log("Datos recibidos:", body);
  const { nombre, carrera, jornada } = body || {};

  // Verificar que se envíen los campos requeridos
  if (!nombre || !carrera || !jornada) {
    throw createError({
      statusCode: 400,
      statusMessage: "Faltan campos requeridos",
    });
  }

  // Verificar token en el encabezado
  const authHeader = getHeader(event, "Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw createError({
      statusCode: 401,
      statusMessage: "Acceso no autorizado",
    });
  }
  const token = authHeader.split(" ")[1];

  let decoded: { userId: number; role: string };
  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret"
    ) as { userId: number; role: string };
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw createError({
        statusCode: 401,
        statusMessage: "Token expirado",
      });
    }
    if (error.name === "JsonWebTokenError") {
      throw createError({
        statusCode: 401,
        statusMessage: "Token inválido",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: "Error interno del servidor",
    });
  }

  // Extraer el id del docente desde el token
  const docenteId = decoded.userId;
  const role = decoded.role;

  // Validar que el rol sea DOCENTE
  if (role !== "DOCENTE") {
    throw createError({
      statusCode: 403,
      statusMessage: "Solo los docentes pueden crear asignaturas",
    });
  }

  // Crear la asignatura usando el id obtenido del token
  try {
    const course = await prisma.asignatura.create({
      data: {
        nombre,
        carrera,
        jornada,
        idDocente: docenteId,
        activo: true,
      },
    });
    return course;
  } catch (error) {
    console.error("Error al crear la asignatura:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Error al crear la asignatura",
    });
  }
});
