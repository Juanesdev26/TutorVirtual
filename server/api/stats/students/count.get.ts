import prisma from "~/lib/prisma";
import { defineEventHandler } from "h3";


export default defineEventHandler(async () => {
  const count = await prisma.estudiante.count();
  return { count };
});