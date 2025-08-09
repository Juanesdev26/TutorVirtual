// server/api/docente/eventos/index.get.ts
import prisma from "~/lib/prisma";
import { Rol } from "@prisma/client";
import { defineEventHandler, createError, getRequestHeader } from "h3";
import jwt from "jsonwebtoken";


export default defineEventHandler(async (event) => {
  try {
    // Verificar autenticación
    const authHeader = getRequestHeader(event, "authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw createError({
        statusCode: 401,
        message: "Acceso no autorizado",
      });
    }
    const token = authHeader.split(" ")[1];

    // Verificar token
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: number;
        role: Rol;
      };
    } catch (error) {
      throw createError({
        statusCode: 401,
        message: "Token inválido",
      });
    }

    // Configurar filtros según rol
    let whereRecordatorios = {};
    let whereAsignaturas = {};

    if (decodedToken.role === Rol.DOCENTE) {
      // Obtener asignaturas del docente
      const asignaturasDocente = await prisma.asignatura.findMany({
        where: { idDocente: decodedToken.userId },
        select: { id: true },
      });

      const asignaturaIds = asignaturasDocente.map((a) => a.id);

      whereRecordatorios = {
        asignaturaId: { in: asignaturaIds },
      };

      whereAsignaturas = {
        idDocente: decodedToken.userId,
      };
    }

    // Obtener recordatorios filtrados
    const eventos = await prisma.recordatorio.findMany({
      where: whereRecordatorios,
      include: {
        asignatura: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: { fecha: "asc" },
    });

    // Obtener asignaturas filtradas
    const asignaturas = await prisma.asignatura.findMany({
      where: whereAsignaturas,
      select: { id: true, nombre: true },
    });

    return {
      eventos: eventos.map((e: any) => ({
        id: e.id,
        title: e.titulo,
        date: e.fecha.toISOString(),
        description: e.descripcion,
        importance: e.importancia,
        asignatura: e.asignatura,
      })),
      asignaturas,
    };
  } catch (error) {
    console.error("Error:", error);
    throw createError({
      statusCode: 500,
      message: "Error al obtener los datos",
    });
  }
});
