// server/api/admin/[users].post.ts
import prisma from "~/lib/prisma";
import { Rol } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { H3Event, defineEventHandler, readBody } from "h3"; // Import the necessary functions


interface CreateDocenteBody {
  documentoIdentidad: string;
  nombre: string;
  correo: string;
  telefono?: string;
  contrasena: string;
}

export default defineEventHandler(async (event: H3Event) => {
  const body: CreateDocenteBody = await readBody(event);
  const {
    documentoIdentidad,
    nombre,
    correo,
    telefono = "",
    contrasena,
  } = body;

  // Validar que todos los campos obligatorios estén presentes
  if (!documentoIdentidad || !nombre || !correo || !contrasena) {
    throw createError({
      statusCode: 400,
      statusMessage: "Todos los campos son obligatorios.",
    });
  }

  try {
    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Crear el usuario con el rol de DOCENTE
    const user = await prisma.usuario.create({
      data: {
        documentoIdentidad,
        nombre,
        correo,
        telefono,
        contrasena: hashedPassword,
        rol: Rol.DOCENTE, // Asignar el rol de DOCENTE
      },
    });

    return { message: "Docente creado exitosamente", userId: user.id };
  } catch (error: unknown) {
    console.error("Error al crear el docente:", error);

    // Manejar errores de Prisma (por ejemplo, correo duplicado)
    if (error instanceof Error) {
      throw createError({
        statusCode: 500,
        message: `Error al crear el docente: ${error.message}`,
      });
    } else {
      throw createError({
        statusCode: 500,
        message: "Error desconocido al crear el docente.",
      });
    }
  }
});
