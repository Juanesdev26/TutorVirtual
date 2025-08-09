import prisma from "~/lib/prisma"
import { defineEventHandler, readBody, createError } from "h3"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { idAsignatura, nombre, tipo, url } = body || {}

  if (!idAsignatura || !nombre || !tipo || !url) {
    throw createError({ statusCode: 400, message: "Campos requeridos: idAsignatura, nombre, tipo, url" })
  }

  if (typeof idAsignatura !== 'number') {
    throw createError({ statusCode: 400, message: "idAsignatura debe ser numérico" })
  }

  try {
    const asignatura = await prisma.asignatura.findUnique({ where: { id: idAsignatura } })
    if (!asignatura) {
      throw createError({ statusCode: 404, message: "La asignatura no existe" })
    }

    const material = await prisma.material.create({
      data: {
        idAsignatura,
        nombre,
        tipo,
        url,
      },
    })

    return material
  } catch (error) {
    console.error("Error creando material:", error)
    throw createError({ statusCode: 500, message: "Error creando material" })
  }
})
