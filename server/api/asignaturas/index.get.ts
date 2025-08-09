// server/api/asignaturas/index.get.ts
import prisma from "~/lib/prisma";
import { defineEventHandler, createError, getHeader } from "h3";
import jwt from "jsonwebtoken";


export default defineEventHandler(async (event) => {
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

  try {
    // Filtrar las asignaturas por idDocente
    const asignaturas = await prisma.asignatura.findMany({
      where: {
        idDocente: docenteId, // Solo las asignaturas del docente logeado
      },
      include: {
        estudiantes: true, // Incluir los estudiantes relacionados
      },
    });
    return asignaturas;
  } catch (error) {
    console.error("Error al obtener las asignaturas:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Error al obtener las asignaturas",
    });
  }
});
