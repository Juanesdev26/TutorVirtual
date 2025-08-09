// server/api/estudiantes/register.post.ts
import prisma from "~/lib/prisma";
import bcrypt from "bcryptjs";
import { defineEventHandler, readBody } from "h3";


export default defineEventHandler(async (event) => {
  try {
    // Usar event.context para obtener el body de la solicitud
    const body = await readBody(event);
    const {
      documentoIdentidad,
      nombre,
      carrera,
      correo,
      contrasena,
      enlaceRegistro,
    } = body;

    // Hasheo de la contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Buscar la asignatura por el enlace de registro
    const asignatura = await prisma.asignatura.findUnique({
      where: { enlaceRegistro: enlaceRegistro }, // Buscar la asignatura usando el enlace único
    });

    if (!asignatura) {
      console.error("Asignatura no encontrada");
      return { status: 404, message: "Asignatura no encontrada" };
    }

    // Crear al nuevo estudiante
    const nuevoEstudiante = await prisma.estudiante.create({
      data: {
        documentoIdentidad: documentoIdentidad,
        nombre: nombre,
        carrera: carrera,
        correo: correo,
        contrasena: hashedPassword,
        asignaturaId: asignatura.id, // Asignación automática de la asignatura
        usuarioId: 1, // Este valor debe corresponder al ID de un usuario previamente creado
      },
    });

    console.log("Estudiante registrado:", nuevoEstudiante);
    return { status: 200, message: "Estudiante registrado exitosamente" };
  } catch (error) {
    console.error("Error registrando el estudiante:", error);
    return { status: 500, message: "Error interno del servidor" };
  }
});
