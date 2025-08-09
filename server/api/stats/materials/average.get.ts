import prisma from "~/lib/prisma";
import { defineEventHandler } from "h3";


export default defineEventHandler(async () => {
  const totalMaterials = await prisma.material.count();
  const subjectsCount = await prisma.asignatura.count();

  const averageMaterials =
    subjectsCount > 0 ? (totalMaterials / subjectsCount).toFixed(1) : 0;

  return { averageMaterials };
});
