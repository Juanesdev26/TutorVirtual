// server/api/asignaturas/delete.delete.ts
import prisma from "~/lib/prisma";
import { H3Event, defineEventHandler, readBody } from "h3"; // Import the necessary functions


export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody(event);
  const { id } = body;

  try {
    // Eliminar los estudiantes asociados a la asignatura
    await prisma.estudiante.deleteMany({
      where: { asignaturaId: id },
    });

    // Luego eliminar la asignatura
    await prisma.asignatura.delete({
      where: { id },
    });

    return {
      message: "Asignatura y estudiantes asociados eliminados exitosamente",
    };
  } catch (error) {
    console.error("Error eliminando la asignatura:", error);
    throw createError({
      statusCode: 500,
      message: "Error eliminando la asignatura",
    });
  }
});
