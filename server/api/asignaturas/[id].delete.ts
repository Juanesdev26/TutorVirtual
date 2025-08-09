// server/api/asignaturas/[id].delete.ts
import prisma from "~/lib/prisma";
import { H3Event, defineEventHandler } from "h3"; // Import the necessary functions


export default defineEventHandler(async (event: H3Event) => {
  const id = event.context.params?.id;

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "ID de asignatura no proporcionado",
    });
  }

  try {
    // Primero, eliminamos todos los estudiantes asociados a esta asignatura
    await prisma.estudiante.deleteMany({
      where: {
        asignaturaId: Number.parseInt(id),
      },
    });

    // Luego, eliminamos la asignatura
    await prisma.asignatura.delete({
      where: {
        id: Number.parseInt(id),
      },
    });

    return {
      message: "Asignatura y estudiantes asociados eliminados exitosamente",
    };
  } catch (error) {
    console.error("Error detallado al eliminar la asignatura:", error);
    if (error instanceof Error) {
      throw createError({
        statusCode: 500,
        statusMessage: `Error al eliminar la asignatura: ${error.message}`,
      });
    } else {
      throw createError({
        statusCode: 500,
        statusMessage: "Error desconocido al eliminar la asignatura",
      });
    }
  }
});
