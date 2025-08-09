import prisma from "~/lib/prisma";


export default defineEventHandler(async (event) => {
  const idParam = event.context.params?.id;

  if (!idParam) {
    throw createError({
      statusCode: 400,
      message: "El ID de la asignatura no está definido.",
    });
  }

  const idAsignatura = parseInt(idParam);
  if (isNaN(idAsignatura)) {
    throw createError({
      statusCode: 400,
      message: "El ID de la asignatura no es válido.",
    });
  }

  // Obtener los materiales de la asignatura
  const materiales = await prisma.material.findMany({
    where: { idAsignatura },
  });

  return materiales;
});
