// server/api/students/activities.get.ts
import { defineEventHandler } from "h3";
import prisma from "~/lib/prisma";


export default defineEventHandler(async (event) => {
  try {
    const materials = await prisma.material.findMany({
      where: {
        asignatura: {
          estudiantes: {
            some: {
              id: 1, // Esto debería ser dinámico basado en el estudiante autenticado
            },
          },
        },
      },
      orderBy: {
        creadoEn: "desc",
      },
      take: 5,
      select: {
        id: true,
        nombre: true, // Corregido a 'nombre' en lugar de 'nombreArchivo'
        creadoEn: true,
        tipo: true, // Corregido a 'tipo' en lugar de 'tipoArchivo'
      },
    });
    return materials.map((material) => ({
      id: material.id,
      title: material.nombre, // Corregido a 'nombre' en lugar de 'nombreArchivo'
      date: material.creadoEn.toISOString(),
      type: material.tipo, // Corregido a 'tipo' en lugar de 'tipoArchivo'
    }));
  } catch (error) {
    console.error("Error fetching activities:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Error fetching activities",
    });
  }
});
