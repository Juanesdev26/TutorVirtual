// server/api/admin/[users].put.ts
import prisma from "~/lib/prisma";
import * as bcrypt from "bcrypt";
import { H3Event, defineEventHandler, readBody } from "h3"; // Import the necessary functions


export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody(event);
  const { id, nombre, correo, telefono, documentoIdentidad, contrasena } = body;

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "ID is required",
    });
  }

  try {
    // Encriptar la contraseña solo si se proporciona una nueva
    const hashedPassword = contrasena
      ? await bcrypt.hash(contrasena, 10)
      : undefined;

    const updatedUser = await prisma.usuario.update({
      where: { id },
      data: {
        nombre,
        correo,
        telefono,
        documentoIdentidad,
        contrasena: hashedPassword, // Solo actualizar la contraseña si se proporciona una nueva
      },
    });

    return { message: "Usuario actualizado correctamente", user: updatedUser };
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Error al actualizar el usuario",
    });
  }
});
