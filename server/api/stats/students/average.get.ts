import prisma from "~/lib/prisma";
import { defineEventHandler } from "h3";


export default defineEventHandler(async () => {
  const [studentsCount, subjectsCount] = await Promise.all([
    prisma.estudiante.count(),
    prisma.asignatura.count(),
  ]);

  const average =
    subjectsCount > 0 ? (studentsCount / subjectsCount).toFixed(1) : 0;

  return { average };
});
