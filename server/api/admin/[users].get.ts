// server/api/admin/[users].get.ts
import prisma from "~/lib/prisma";
import { Rol } from "@prisma/client";
import { H3Event, defineEventHandler, getQuery } from "h3"; // Import the necessary functions


export default defineEventHandler(async (event: H3Event) => {
  const query = getQuery(event);
  const page = parseInt(query.page as string) || 1;
  const limit = parseInt(query.limit as string) || 50;
  const search = (query.search as string) || "";

  const whereClause = {
    rol: Rol.DOCENTE,
    OR: [
      { nombre: { contains: search.toLocaleLowerCase() } },
      { correo: { contains: search.toLocaleLowerCase() } },
      { telefono: { contains: search.toLocaleLowerCase() } },
      { documentoIdentidad: { contains: search.toLocaleLowerCase() } },
    ],
  };

  const totalUsers = await prisma.usuario.count({ where: whereClause });
  const users = await prisma.usuario.findMany({
    where: whereClause,
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      documentoIdentidad: true, // Asegúrate de que este campo esté incluido
      nombre: true,
      correo: true,
      telefono: true,
      rol: true,
      contrasena: true,
    },
  });

  return {
    users,
    total: totalUsers,
    page,
    totalPages: Math.ceil(totalUsers / limit),
  };
});
