// server/api/asignaturas/[asignaturaId]/generate-link.post.ts
import prisma from "~/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { H3Event, defineEventHandler } from "h3"; // Import the necessary functions


export default defineEventHandler(async (event: H3Event) => {
  const asignaturaId = Number(event.context.params?.asignaturaId);

  try {
    const enlaceRegistro = uuidv4();
    const fechaExpiracion = new Date(Date.now() + 20 * 60 * 1000); // 20 minutos desde ahora

    const asignatura = await prisma.asignatura.update({
      where: { id: asignaturaId },
      data: {
        enlaceRegistro,
        fechaExpiracion,
      },
    });

    return {
      enlaceRegistro: asignatura.enlaceRegistro,
      fechaExpiracion: asignatura.fechaExpiracion,
    };
  } catch (error) {
    console.error("Error generando el enlace:", error);
    throw createError({
      statusCode: 500,
      message: "Error generando el enlace",
    });
  } finally {
    await prisma.$disconnect();
  }
});
