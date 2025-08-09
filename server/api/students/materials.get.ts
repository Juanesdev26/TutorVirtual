import prisma from "~/lib/prisma";
import { defineEventHandler, createError, getRequestHeaders } from "h3";
import jwt from "jsonwebtoken";


export default defineEventHandler(async (event) => {
  try {
    // Obtener el token del header
    const headers = getRequestHeaders(event);
    const token = headers.authorization?.split(" ")[1] || "";

    if (!token) {
      throw createError({ statusCode: 401, message: "Acceso no autorizado" });
    }

    // Decodificar el token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret"
    ) as {
      userId: number;
      asignaturaId: number;
    };

    // Obtener materiales de la asignatura del estudiante
    const materials = await prisma.material.findMany({
      where: {
        idAsignatura: decoded.asignaturaId,
        tipo: {
          in: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          ],
        },
      },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        creadoEn: true,
        url: true,
      },
    });

    // Procesar materiales sin análisis IA (no se agrega la propiedad "topics")
    const processedMaterials = materials.map((material) => ({
      ...material,
      creadoEn: material.creadoEn.toISOString(),
    }));

    return processedMaterials;
  } catch (error) {
    console.error("Error:", error);
    throw createError({
      statusCode: 500,
      message: "Error al obtener materiales",
    });
  }
});
