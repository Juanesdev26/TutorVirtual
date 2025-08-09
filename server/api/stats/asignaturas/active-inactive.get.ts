import prisma from "~/lib/prisma";
import { defineEventHandler } from "h3";


export default defineEventHandler(async () => {
  const active = await prisma.asignatura.count({
    where: { activo: true },
  });

  const inactive = await prisma.asignatura.count({
    where: { activo: false },
  });

  return { active, inactive };
});
