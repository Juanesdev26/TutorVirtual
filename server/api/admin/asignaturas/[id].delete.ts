import prisma from "~/lib/prisma";
import { defineEventHandler, getRouterParam, createError } from "h3";


export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id"); // ✅ Corrección clave

  if (!id || isNaN(Number(id))) {
    throw createError({
      statusCode: 400,
      statusMessage: "ID de asignatura inválido",
    });
  }

  try {
    // Eliminar estudiantes asociados
    await prisma.estudiante.deleteMany({
      where: { asignaturaId: Number(id) },
    });

    // Eliminar asignatura
    await prisma.asignatura.delete({
      where: { id: Number(id) },
    });

    return { message: "Asignatura y estudiantes eliminados exitosamente" };
  } catch (error) {
    console.error("Error:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Error al eliminar la asignatura",
    });
  }
});
