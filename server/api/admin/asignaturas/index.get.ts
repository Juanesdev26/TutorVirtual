import prisma from "~/lib/prisma";
import { Prisma, Rol} from "@prisma/client";
import { H3Event, defineEventHandler, getQuery } from "h3";


export default defineEventHandler(async (event: H3Event) => {
  const query = getQuery(event);
  const page = parseInt(query.page as string) || 1;
  const limit = parseInt(query.limit as string) || 50;
  const search = (query.search as string) || "";

  const whereClause = {
    docente: {
      is: { rol: Rol.DOCENTE },
    },
    OR: [
      { nombre: { contains: search, mode: Prisma.QueryMode.insensitive } },
      { carrera: { contains: search, mode: Prisma.QueryMode.insensitive } },
      { docente: { is: { nombre: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
    ],
  };

  const totalAsignaturas = await prisma.asignatura.count({
    where: whereClause,
  });

  const asignaturas = await prisma.asignatura.findMany({
    where: whereClause,
    skip: (page - 1) * limit,
    take: limit,
    include: {
      docente: {
        select: {
          id: true,
          nombre: true,
        },
      },
    },
  });

  return {
    asignaturas,
    total: totalAsignaturas,
    page,
    totalPages: Math.ceil(totalAsignaturas / limit),
  };
});
