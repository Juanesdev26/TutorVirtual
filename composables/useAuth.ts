import { ref } from "vue"
import { useRouter } from "vue-router"
import { jwtDecode } from "jwt-decode"

interface AuthResponse {
  token: string
  role: string
}

interface User {
  email?: string
  role: string
  id: number
}

export const useAuth = () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const router = useRouter()

  // Inicializar el estado de autenticación desde localStorage
  const initAuth = () => {
    if (process.client) {
      const storedToken = localStorage.getItem("token")
      const storedUser = localStorage.getItem("user")
      if (storedToken && storedUser) {
        token.value = storedToken
        user.value = JSON.parse(storedUser)
      }
    }
  }

  // Función de inicio de sesión
  const login = async (email: string, password: string) => {
    try {
      const response = await $fetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      })

      const decodedToken = jwtDecode<{ userId: number; role: string; email?: string }>(response.token)

      token.value = response.token
      user.value = {
        email: decodedToken.email ?? email,
        role: decodedToken.role,
        id: decodedToken.userId,
      }

      localStorage.setItem("token", response.token)
      localStorage.setItem("user", JSON.stringify(user.value))

      redirectBasedOnRole(response.role)

      return response
    } catch (error) {
      console.error("Error de inicio de sesión:", error)
      throw error
    }
  }

  // Función de registro
  const register = async (
    email: string,
    password: string,
    role: string,
    documentoIdentidad: string,
    nombre: string,
    telefono: string,
  ) => {
    try {
      const response = await $fetch<{ message: string; userId: number }>("/api/auth/register", {
        method: "POST",
        body: {
          email,
          password,
          role,
          documentoIdentidad,
          nombre,
          telefono,
        },
      })
      return response
    } catch (error) {
      console.error("Error de registro:", error)
      throw error
    }
  }

  // Función de cierre de sesión
  const logout = () => {
    user.value = null
    token.value = null
    if (process.client) {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
    }
    router.push("/login")
  }

  // Verificar estado de autenticación
  const isAuthenticated = () => {
    return !!token.value
  }

  // Obtener rol del usuario
  const getUserRole = () => {
    return user.value?.role
  }

  // Redirigir basado en el rol
  const redirectBasedOnRole = (role: string) => {
    switch (role) {
      case "ADMIN":
        router.push("/admin")
        break
      case "DOCENTE":
        router.push("/teacher")
        break
      case "ESTUDIANTE":
        router.push("/student")
        break
      default:
        router.push("/")
    }
  }

  // Nueva función para refrescar el token
  // Eliminada: el endpoint /api/auth/refresh no existe actualmente.

  // Inicializar el estado de autenticación cuando se usa el composable
  if (process.client) {
    initAuth()
  }

  return {
    user,
    token,
    login,
    register,
    logout,
    isAuthenticated,
    getUserRole,
  }
}
