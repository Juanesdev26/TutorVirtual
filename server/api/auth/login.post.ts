// server/api/auth/login.post.ts
import prisma from "~/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { defineEventHandler, readBody, createError } from "h3";


interface LoginRequest {
  email: string;
  password: string;
}

export default defineEventHandler(async (event) => {
  const body: LoginRequest = await readBody(event);
  const { email, password } = body;

  try {
    // Check in Usuario table
    const usuario = await prisma.usuario.findUnique({
      where: { correo: email },
      select: {
        id: true,
        contrasena: true,
        rol: true,
      },
    });

    if (usuario) {
      const isPasswordValid = await bcrypt.compare(
        password,
        usuario.contrasena
      );
      if (!isPasswordValid) {
        throw createError({
          statusCode: 401,
          message: "Invalid credentials",
        });
      }
      const token = jwt.sign(
        { userId: usuario.id, role: usuario.rol, email },
        process.env.JWT_SECRET || "fallback_secret",
        { expiresIn: "1h" }
      );
      return { token, role: usuario.rol, userId: usuario.id }; // Devuelve el userId
    }

    // Check in Estudiante table
    const estudiante = await prisma.estudiante.findUnique({
      where: { correo: email },
      select: {
        id: true,
        contrasena: true,
        asignaturaId: true,
      },
    });

    if (estudiante) {
      const isPasswordValid = await bcrypt.compare(
        password,
        estudiante.contrasena
      );
      if (!isPasswordValid) {
        throw createError({
          statusCode: 401,
          message: "Invalid credentials",
        });
      }
      const token = jwt.sign(
        { userId: estudiante.id, role: "ESTUDIANTE", asignaturaId: estudiante.asignaturaId, email },
        process.env.JWT_SECRET || "fallback_secret",
        { expiresIn: "1h" }
      );
      return { token, role: "ESTUDIANTE", asignaturaId: estudiante.asignaturaId, userId: estudiante.id }; // Devuelve el userId
    }

    throw createError({
      statusCode: 401,
      message: "Invalid credentials",
    });
  } catch (error) {
    console.error("Login error:", error);
    throw createError({
      statusCode: 500,
      message: "Internal server error",
    });
  }
});