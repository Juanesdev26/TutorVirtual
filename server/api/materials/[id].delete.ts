import prisma from "~/lib/prisma";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NUXT_PUBLIC_SUPABASE_URL!,
  process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default defineEventHandler(async (event) => {
  const idParam = event.context.params?.id;

  if (!idParam) {
    throw createError({
      statusCode: 400,
      message: "Material ID is required.",
    });
  }
  const idMaterial = parseInt(idParam);
  if (isNaN(idMaterial)) {
    throw createError({
      statusCode: 400,
      message: "El ID del material no es válido.",
    });
  }

  try {
    // Obtener el material de la base de datos
    const material = await prisma.material.findUnique({
      where: { id: idMaterial },
    });

    if (!material) {
      throw createError({
        statusCode: 404,
        message: "El material no existe.",
      });
    }

    // Eliminar el archivo de Supabase Storage
    const { error: supabaseError } = await supabase.storage
      .from("files")
      .remove([material.url.split("/").pop()!]); // Extraer el nombre del archivo de la URL

    if (supabaseError) {
      throw createError({
        statusCode: 500,
        message: "Error al eliminar el archivo de Supabase.",
      });
    }

    // Eliminar el material de la base de datos
    await prisma.material.delete({
      where: { id: idMaterial },
    });

    return { success: true };
  } catch (err) {
    console.error(err);
    throw createError({
      statusCode: 500,
      message: "Error interno del servidor.",
    });
  }
});
