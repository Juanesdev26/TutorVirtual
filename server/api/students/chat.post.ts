import { defineEventHandler, readBody } from 'h3'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'

// Inicializar Prisma y Google AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// Configuración del modelo
const modelName = 'gemini-1.5-pro'
const maxOutputTokens = 8192

// Configuración de YouTube API
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search'

// Definir interfaces para los tipos de datos
interface QuizData {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  timestamp: Date;
}

interface Ejemplo {
  id: number;
  titulo: string;
  problema: string;
  solucion: string;
  conclusion: string;
}

// Sistema simple de limitación de tasa (rate limiting)
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly limit: number;
  private readonly interval: number;

  constructor(limit: number = 5, interval: number = 60000) { // 5 solicitudes por minuto
    this.limit = limit;
    this.interval = interval;
  }

  canMakeRequest(userId: number): boolean {
    const now = Date.now();
    const userKey = userId.toString();
    
    if (!this.requests.has(userKey)) {
      this.requests.set(userKey, [now]);
      return true;
    }

    const userRequests = this.requests.get(userKey)!;
    const recentRequests = userRequests.filter(time => time > now - this.interval);
    
    if (recentRequests.length < this.limit) {
      this.requests.set(userKey, [...recentRequests, now]);
      return true;
    }

    return false;
  }

  getTimeUntilNextRequest(userId: number): number {
    const now = Date.now();
    const userKey = userId.toString();
    const userRequests = this.requests.get(userKey);
    
    if (!userRequests || userRequests.length === 0) return 0;
    
    const oldestRequest = Math.min(...userRequests);
    const timeUntilReset = this.interval - (now - oldestRequest);
    
    return Math.max(0, timeUntilReset);
  }
}

const rateLimiter = new RateLimiter();

// Función para verificar token (ya que no tienes ~/server/utils/auth)
async function verifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret')
    return decoded
  } catch (error) {
    return null
  }
}

// Almacenamiento en memoria para mensajes de chat y datos de estudio
// En producción, deberías usar una base de datos real para esto
const chatStorage = {
  messages: new Map<number, Array<{role: string, content: string, timestamp: Date}>>(),
  currentTopics: new Map<number, string>(),
  topicsProgress: new Map<number, Map<string, {progress: number, completed: boolean}>>(),
  studyDocuments: new Map<number, Array<{id: number, title: string, topics: string[], type: string, url: string}>>(),
  quizzes: new Map<string, QuizData>() // Almacenamiento específico para quizzes
}

// Función para generar contenido del tema con mejor formato
const generateTopicContent = async (model: any, topic: string) => {
  const prompt = `
    Actúa como un tutor experto en ${topic}. 
    Proporciona una explicación estructurada y clara sobre este tema.
    
    Estructura tu respuesta con el siguiente formato exacto para facilitar el procesamiento:

    # ${topic}

    ## Definición
    [Proporciona una definición clara y concisa del concepto]

    ## Conceptos Clave
    - **[Concepto 1]**: [Breve explicación]
    - **[Concepto 2]**: [Breve explicación]
    - **[Concepto 3]**: [Breve explicación]

    ## Explicación Detallada
    [Desarrolla una explicación profunda del tema, usando párrafos bien estructurados]

    ## Ejemplo Resuelto
    Problema: [Plantea un problema práctico]
    
    Solución:
    1. [Primer paso con explicación]
    2. [Segundo paso con explicación]
    3. [Tercer paso con explicación]
    
    Conclusión: [Resultado final]

    ## Aplicaciones Prácticas
    1. [Primera aplicación]
    2. [Segunda aplicación]
    3. [Tercera aplicación]

    Asegúrate de usar exactamente los encabezados y formato indicados para facilitar el procesamiento.
  `

  // Asegurar que el primer mensaje sea del usuario
  const chat = model.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: `Quiero aprender sobre ${topic}` }]
      }
    ],
    generationConfig: {
      maxOutputTokens: maxOutputTokens,
    },
  })
  
  const result = await chat.sendMessage(prompt)
  const response = await result.response
  return response.text()
}

// Función para generar ejemplos adicionales
const generateAdditionalExamples = async (model: any, topic: string) => {
  const prompt = `
    Genera dos ejemplos detallados sobre ${topic}.
    
    Para cada ejemplo, usa este formato exacto:

    # Ejemplo 1: [Título descriptivo]
    
    ## Problema
    [Descripción clara del problema a resolver]

    ## Solución Paso a Paso
    1. [Primer paso]
       * **Explicación**: [Por qué hacemos este paso]
       * **Cálculos**: [Detalles matemáticos si aplican]
    
    2. [Segundo paso]
       * **Explicación**: [Por qué hacemos este paso]
       * **Cálculos**: [Detalles matemáticos si aplican]
    
    3. [Tercer paso]
       * **Explicación**: [Por qué hacemos este paso]
       * **Cálculos**: [Detalles matemáticos si aplican]

    ## Conclusión
    [Resumen del resultado y su significado]

    # Ejemplo 2: [Título descriptivo]
    [Mismo formato que el ejemplo 1]
    
    Asegúrate de usar exactamente los encabezados y formato indicados para facilitar el procesamiento.
  `

  // Asegurar que el primer mensaje sea del usuario
  const chat = model.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: `Necesito ejemplos prácticos sobre ${topic}` }]
      }
    ],
    generationConfig: {
      maxOutputTokens: maxOutputTokens,
    },
  })
  
  const result = await chat.sendMessage(prompt)
  const response = await result.response
  return response.text()
}

// Función para generar preguntas de quiz
const generateQuiz = async (model: any, topic: string) => {
  const prompt = `
    Genera una pregunta de evaluación sobre ${topic}.
    
    La pregunta debe:
    1. Evaluar comprensión profunda del tema
    2. Tener 4 opciones (A, B, C, D)
    3. Incluir una explicación detallada de la solución
    
    Usa este formato exacto:

    PREGUNTA
    [Texto de la pregunta]

    OPCIONES
    A) [Opción A]
    B) [Opción B]
    C) [Opción C]
    D) [Opción D]

    RESPUESTA_CORRECTA
    [Letra de la respuesta correcta]

    EXPLICACION
    1. **Análisis del problema**:
       [Explicar cómo abordar el problema]
    
    2. **Proceso de solución**:
       [Detallar paso a paso cómo se llega a la respuesta]
    
    3. **Por qué las otras opciones son incorrectas**:
       - Opción [X]: [Explicar por qué es incorrecta]
       - Opción [Y]: [Explicar por qué es incorrecta]
       - Opción [Z]: [Explicar por qué es incorrecta]
    
    4. **Conclusión**:
       [Reforzar el concepto clave evaluado]
  `

  // Asegurar que el primer mensaje sea del usuario
  const chat = model.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: `Necesito una pregunta de quiz sobre ${topic}` }]
      }
    ],
    generationConfig: {
      maxOutputTokens: maxOutputTokens,
    },
  })
  
  const result = await chat.sendMessage(prompt)
  const response = await result.response
  const responseText = response.text()

  // Extraer las partes del quiz
  const questionMatch = responseText.match(/PREGUNTA\n([\s\S]*?)\n\nOPCIONES/)
  const optionsMatch = responseText.match(/OPCIONES\n([\s\S]*?)\n\nRESPUESTA_CORRECTA/)
  const answerMatch = responseText.match(/RESPUESTA_CORRECTA\n([A-D])/)
  const explanationMatch = responseText.match(/EXPLICACION\n([\s\S]*?)$/)

  // Extraer las opciones individuales
  let options: string[] = [];
  if (optionsMatch && optionsMatch[1]) {
    const optionsText = optionsMatch[1].trim();
    options = [
      optionsText.match(/A\)(.*?)(?=\nB\)|$)/s)?.[1]?.trim() || '',
      optionsText.match(/B\)(.*?)(?=\nC\)|$)/s)?.[1]?.trim() || '',
      optionsText.match(/C\)(.*?)(?=\nD\)|$)/s)?.[1]?.trim() || '',
      optionsText.match(/D\)(.*?)(?=\n|$)/s)?.[1]?.trim() || ''
    ];
  }

  return {
    question: questionMatch ? questionMatch[1].trim() : '',
    options: options,
    correctAnswer: answerMatch ? answerMatch[1] : '',
    explanation: explanationMatch ? explanationMatch[1].trim() : ''
  }
}

// Función para buscar videos en YouTube
async function buscarVideoYouTube(tema: string) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API Key no configurada')
  }
  
  try {
    // Buscar videos educativos sobre el tema
    const response = await axios.get(YOUTUBE_API_URL, {
      params: {
        part: 'snippet',
        maxResults: 1,
        q: `${tema} educativo explicación tutorial`,
        type: 'video',
        relevanceLanguage: 'es',
        key: YOUTUBE_API_KEY
      }
    })
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('No se encontraron videos')
    }
    
    const video = response.data.items[0]
    
    return {
      provider: 'youtube',
      videoId: video.id.videoId,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnailUrl: video.snippet.thumbnails.high.url
    }
  } catch (error) {
    console.error('Error al buscar videos en YouTube:', error)
    throw error
  }
}

// Función para procesar el texto de respuesta y extraer secciones estructuradas
function procesarContenidoTema(responseText: string) {
  // Extraer título
  const titleMatch = responseText.match(/^#\s*(.*?)$/m) || responseText.match(/^(.*?)$/m)
  const title = titleMatch ? titleMatch[1].trim() : ''
  
  // Extraer definición
  const definitionRegex = /## Definición\n([\s\S]*?)(?=\n##)/i
  const definitionMatch = responseText.match(definitionRegex)
  const definition = definitionMatch ? definitionMatch[1].trim() : ''
  
  // Extraer conceptos clave
  const conceptsRegex = /## Conceptos Clave\n([\s\S]*?)(?=\n##)/i
  const conceptsMatch = responseText.match(conceptsRegex)
  const conceptsText = conceptsMatch ? conceptsMatch[1] : ''
  
  // Procesar cada concepto
  const conceptLines = conceptsText.split('\n').filter(line => line.trim().startsWith('-'))
  const concepts = conceptLines.map(line => {
    const cleanLine = line.replace(/^-\s*/, '').trim()
    const titleMatch = cleanLine.match(/\*\*(.*?)\*\*:(.*)/) || cleanLine.match(/(.*?):(.*)/)
    
    if (titleMatch) {
      return {
        title: titleMatch[1].replace(/\*\*/g, '').trim(),
        description: titleMatch[2].trim()
      }
    }
    
    return {
      title: 'Concepto',
      description: cleanLine
    }
  })
  
  // Extraer explicación detallada
  const explanationRegex = /## Explicación Detallada\n([\s\S]*?)(?=\n##)/i
  const explanationMatch = responseText.match(explanationRegex)
  const explanation = explanationMatch ? explanationMatch[1].trim() : ''
  
  // Extraer ejemplo resuelto
  const exampleRegex = /## Ejemplo Resuelto\n([\s\S]*?)(?=\n##|$)/i
  const exampleMatch = responseText.match(exampleRegex)
  const exampleText = exampleMatch ? exampleMatch[1] : ''
  
  // Extraer problema y solución
  const problemRegex = /Problema:\s*([\s\S]*?)(?=\n\nSolución:)/i
  const problemMatch = exampleText.match(problemRegex)
  const problem = problemMatch ? problemMatch[1].trim() : ''
  
  const solutionRegex = /Solución:\s*([\s\S]*?)(?=\n\nConclusión:|$)/i
  const solutionMatch = exampleText.match(solutionRegex)
  const solution = solutionMatch ? solutionMatch[1].trim() : ''
  
  const conclusionRegex = /Conclusión:\s*([\s\S]*?)$/i
  const conclusionMatch = exampleText.match(conclusionRegex)
  const conclusion = conclusionMatch ? conclusionMatch[1].trim() : ''
  
  // Extraer aplicaciones prácticas
  const applicationsRegex = /## Aplicaciones Prácticas\n([\s\S]*?)(?=\n##|$)/i
  const applicationsMatch = responseText.match(applicationsRegex)
  const applicationsText = applicationsMatch ? applicationsMatch[1] : ''
  
  // Procesar aplicaciones
  const applicationLines = applicationsText.split('\n').filter(line => /^\d+\./.test(line.trim()))
  const applications = applicationLines.map(line => line.replace(/^\d+\.\s*/, '').trim())
  
  return {
    title,
    definition,
    concepts,
    explanation,
    example: {
      problem,
      solution,
      conclusion
    },
    applications
  }
}

export default defineEventHandler(async (event) => {
  try {
    // Verificar autenticación
    const token = event.req.headers.authorization?.split(' ')[1]
    if (!token) {
      return { 
        status: 401, 
        message: 'No autorizado' 
      }
    }

    const decoded = await verifyToken(token) as any
    if (!decoded) {
      return { 
        status: 401, 
        message: 'Token inválido' 
      }
    }

    const userId = decoded.userId
    
    // Obtener datos del estudiante
    const estudiante = await prisma.estudiante.findUnique({
      where: { id: userId }
    })

    if (!estudiante) {
      return { 
        status: 404, 
        message: 'Estudiante no encontrado' 
      }
    }

    // Obtener mensaje del usuario
    const body = await readBody(event)
    const userMessage = body.message

    // Inicializar almacenamiento para este usuario si no existe
    if (!chatStorage.messages.has(userId)) {
      chatStorage.messages.set(userId, [])
    }
    if (!chatStorage.topicsProgress.has(userId)) {
      chatStorage.topicsProgress.set(userId, new Map())
    }
    if (!chatStorage.studyDocuments.has(userId)) {
      // Crear documentos de ejemplo para el estudiante
      chatStorage.studyDocuments.set(userId, [
        {
          id: 1,
          title: 'algebra_lineal.pdf',
          topics: ['Transformaciones lineales', 'Espacios vectoriales', 'Matrices'],
          type: 'pdf',
          url: '/documents/algebra_lineal.pdf'
        },
        {
          id: 2,
          title: 'calculo_diferencial.pdf',
          topics: ['Límites', 'Derivadas', 'Integrales'],
          type: 'pdf',
          url: '/documents/calculo_diferencial.pdf'
        }
      ])
    }

    // Obtener historial de chat
    const chatHistory = chatStorage.messages.get(userId) || []
    
    // Formatear historial para el modelo - CORREGIDO PARA ASEGURAR QUE EL PRIMER MENSAJE SEA DEL USUARIO
    let formattedHistory = chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }))
    
    // Si el historial está vacío o el primer mensaje no es del usuario, añadir un mensaje inicial del usuario
    if (formattedHistory.length === 0 || formattedHistory[0].role !== 'user') {
      formattedHistory = [
        {
          role: 'user',
          parts: [{ text: 'Hola, soy un estudiante que necesita ayuda.' }]
        },
        ...formattedHistory
      ]
    }

    // Si es un mensaje de inicio, devolver información inicial
    if (userMessage === 'inicio') {
      // Obtener documentos y temas
      const documents = chatStorage.studyDocuments.get(userId) || []

      // Obtener progreso de temas
      const topicsProgressMap = chatStorage.topicsProgress.get(userId) || new Map()
      
      // Convertir el mapa de progreso a un array
      const formattedTopics = Array.from(topicsProgressMap.entries()).map(([name, data]) => ({
        name,
        progress: data.progress,
        completed: data.completed,
        inProgress: data.progress > 0 && !data.completed
      }))

      // Si no hay temas, crear algunos por defecto
      const defaultTopics = [
        { name: 'Transformaciones lineales', progress: 0, completed: false, inProgress: false },
        { name: 'Espacios vectoriales', progress: 0, completed: false, inProgress: false },
        { name: 'Matrices', progress: 0, completed: false, inProgress: false }
      ]
      if (formattedTopics.length === 0) {
        defaultTopics.forEach(topic => {
          topicsProgressMap.set(topic.name, { 
            progress: topic.progress, 
            completed: topic.completed 
          })
        })
        
        chatStorage.topicsProgress.set(userId, topicsProgressMap)
      }

      return {
        text: null,
        messageType: 'welcome',
        welcomeData: {
          title: 'Bienvenido a tu Tutor Personal',
          description: 'Estoy aquí para ayudarte a dominar los conceptos de física y potenciar tu aprendizaje académico.',
          features: [
            {
              icon: 'book',
              title: 'Explorar Temas',
              description: 'Selecciona temas específicos del panel izquierdo para estudiarlos en profundidad.'
            },
            {
              icon: 'example',
              title: 'Ejemplos Prácticos',
              description: 'Solicita ejemplos detallados con soluciones paso a paso para comprender mejor los conceptos.'
            },
            {
              icon: 'quiz',
              title: 'Evaluación',
              description: 'Pon a prueba tu conocimiento con preguntas tipo test y recibe feedback inmediato.'
            },
            {
              icon: 'video',
              title: 'Recursos Multimedia',
              description: 'Accede a videos y recursos complementarios para enriquecer tu aprendizaje.'
            }
          ],
          cta: '¿Por dónde te gustaría comenzar hoy?'
        },
        estudiante: {
          nombre: estudiante.nombre,
          nivel: Math.floor(estudiante.xp / 100) + 1 // Calcular nivel basado en XP
        },
        xp: estudiante.xp || 0,
        topics: formattedTopics.length > 0 ? formattedTopics : defaultTopics,
        documents: documents
      }
    }

    // Si es una solicitud de estudio de tema
    if (userMessage.startsWith('STUDY_TOPIC:')) {
      const topic = userMessage.replace('STUDY_TOPIC:', '')
      
      // Registrar el tema actual que está estudiando el usuario
      chatStorage.currentTopics.set(userId, topic)
      
      // Verificar si el tema existe en el almacenamiento
      const topicsProgressMap = chatStorage.topicsProgress.get(userId) || new Map()
      
      if (!topicsProgressMap.has(topic)) {
        topicsProgressMap.set(topic, { progress: 0, completed: false })
        chatStorage.topicsProgress.set(userId, topicsProgressMap)
      }
      
      // Verificar límite de tasa
      if (!rateLimiter.canMakeRequest(userId)) {
        const waitTime = rateLimiter.getTimeUntilNextRequest(userId);
        return {
          status: 429,
          message: `Has alcanzado el límite de solicitudes. Por favor espera ${Math.ceil(waitTime / 1000)} segundos.`,
          waitTime,
          messageType: 'error'
        }
      }
      
      // Generar contenido del tema con Gemini
      const model = genAI.getGenerativeModel({ model: modelName })
      
      try {
        // Usar la nueva función para generar contenido estructurado
        const responseText = await generateTopicContent(model, topic)
        
        // Procesar el contenido para obtener secciones estructuradas
        const contenidoProcesado = procesarContenidoTema(responseText)
        
        // Guardar mensaje en el almacenamiento
        const chatMessages = chatStorage.messages.get(userId) || []
        
        // Guardar el mensaje del usuario primero
        chatMessages.push({
          role: 'user',
          content: `Quiero aprender sobre ${topic}`,
          timestamp: new Date()
        })
        
        // Luego guardar la respuesta del asistente
        chatMessages.push({
          role: 'assistant',
          content: responseText,
          timestamp: new Date()
        })
        
        chatStorage.messages.set(userId, chatMessages)
        
        // Actualizar progreso del tema
        const topicData = topicsProgressMap.get(topic) || { progress: 0, completed: false }
        topicData.progress = Math.min(100, topicData.progress + 10)
        topicData.completed = topicData.progress >= 100
        topicsProgressMap.set(topic, topicData)
        
        // Generar un quiz para tener listo (en segundo plano)
        try {
          const quizData = await generateQuiz(model, topic)
          const quizKey = `${userId}_lastQuiz`
          chatStorage.quizzes.set(quizKey, {
            ...quizData,
            timestamp: new Date()
          })
        } catch (error) {
          console.error('Error al generar quiz en segundo plano:', error)
          // No interrumpimos el flujo principal si falla la generación del quiz
        }
        
        return {
          text: responseText,
          messageType: 'topic',
          topicData: {
            title: contenidoProcesado.title || topic,
            definition: contenidoProcesado.definition,
            concepts: contenidoProcesado.concepts,
            explanation: contenidoProcesado.explanation,
            example: contenidoProcesado.example,
            applications: contenidoProcesado.applications
          },
          currentTopic: topic,
          rawContent: responseText // Incluir el contenido sin procesar por si acaso
        }
      } catch (error: any) {
        console.error('Error al generar contenido con Gemini:', error)
        
        // Manejar error de límite de tasa
        if (error.status === 429) {
          return {
            status: 429,
            message: 'Has alcanzado el límite de solicitudes de la API. Por favor, intenta de nuevo en unos minutos.',
            messageType: 'error',
            error: error.message
          }
        }
        
        return {
          text: `Lo siento, tuve un problema al generar información sobre ${topic}. Por favor, intenta de nuevo más tarde.`,
          messageType: 'response',
          error: error.message
        }
      }
    }

    // Para solicitudes de más ejemplos
    if (userMessage.toLowerCase().includes('más ejemplos') || 
        userMessage.toLowerCase().includes('otro ejemplo') || 
        body.requestType === 'examples') {
      
      const temaActual = chatStorage.currentTopics.get(userId)
      
      if (!temaActual) {
        return {
          text: "Por favor, selecciona primero un tema de estudio para ver ejemplos.",
          messageType: 'response'
        }
      }
      
      // Verificar límite de tasa
      if (!rateLimiter.canMakeRequest(userId)) {
        const waitTime = rateLimiter.getTimeUntilNextRequest(userId);
        return {
          status: 429,
          message: `Has alcanzado el límite de solicitudes. Por favor espera ${Math.ceil(waitTime / 1000)} segundos.`,
          waitTime,
          messageType: 'error'
        }
      }
      
      try {
        const model = genAI.getGenerativeModel({ model: modelName })
        const examples = await generateAdditionalExamples(model, temaActual)
        
        // Guardar mensaje en el almacenamiento
        const chatMessages = chatStorage.messages.get(userId) || []
        chatMessages.push({
          role: 'user',
          content: userMessage,
          timestamp: new Date()
        })
        
        chatMessages.push({
          role: 'assistant',
          content: examples,
          timestamp: new Date()
        })
        
        chatStorage.messages.set(userId, chatMessages)
        
        // Actualizar progreso
        const topicsProgressMap = chatStorage.topicsProgress.get(userId) || new Map()
        const topicData = topicsProgressMap.get(temaActual) || { progress: 0, completed: false }
        topicData.progress = Math.min(100, topicData.progress + 5)
        topicsProgressMap.set(temaActual, topicData)
        
        // Procesar ejemplos para mejor visualización
        const ejemplos: Ejemplo[] = [];
        const ejemploRegex = /# Ejemplo \d+: (.*?)(?=\n## Problema|\n$)/g;
        let match;
        let index = 0;
        
        while ((match = ejemploRegex.exec(examples)) !== null) {
          const titulo = match[1];
          const inicio = match.index + match[0].length;
          
          // Buscar el siguiente ejemplo o el final del texto
          const siguienteMatch = examples.indexOf('# Ejemplo', inicio);
          const fin = siguienteMatch > -1 ? siguienteMatch : examples.length;
          
          const contenidoEjemplo = examples.substring(inicio, fin);
          
          // Extraer problema
          const problemaMatch = contenidoEjemplo.match(/## Problema\n([\s\S]*?)(?=\n## Solución|\n$)/);
          const problema = problemaMatch ? problemaMatch[1].trim() : '';
          
          // Extraer solución
          const solucionMatch = contenidoEjemplo.match(/## Solución Paso a Paso\n([\s\S]*?)(?=\n## Conclusión|\n$)/);
          const solucion = solucionMatch ? solucionMatch[1].trim() : '';
          
          // Extraer conclusión
          const conclusionMatch = contenidoEjemplo.match(/## Conclusión\n([\s\S]*?)$/);
          const conclusion = conclusionMatch ? conclusionMatch[1].trim() : '';
          
          ejemplos.push({
            id: index++,
            titulo,
            problema,
            solucion,
            conclusion
          });
        }
        
        return {
          text: examples,
          messageType: 'examples',
          currentTopic: temaActual,
          ejemplosProcesados: ejemplos,
          rawContent: examples
        }
      } catch (error: any) {
        console.error('Error al generar ejemplos:', error)
        
        // Manejar error de límite de tasa
        if (error.status === 429) {
          return {
            status: 429,
            message: 'Has alcanzado el límite de solicitudes de la API. Por favor, intenta de nuevo en unos minutos.',
            messageType: 'error',
            error: error.message
          }
        }
        
        return {
          text: "Lo siento, hubo un problema al generar los ejemplos. Por favor, intenta de nuevo.",
          messageType: 'error'
        }
      }
    }

    // Para respuestas a un quiz (A, B, C, D)
    if (/^[A-D]$/.test(userMessage)) {
      // Obtener el último quiz guardado
      const quizKey = `${userId}_lastQuiz`
      const lastQuiz = chatStorage.quizzes.get(quizKey)
      
      if (!lastQuiz) {
        return {
          text: "No hay ninguna pregunta activa para responder. ¿Quieres intentar un nuevo quiz?",
          messageType: 'response'
        }
      }
      
      const isCorrect = userMessage === lastQuiz.correctAnswer
      const xpGanado = isCorrect ? 20 : 5
      
      // Actualizar XP del estudiante
      await prisma.estudiante.update({
        where: { id: userId },
        data: { xp: { increment: xpGanado } }
      })
      
      // Actualizar progreso del tema si la respuesta es correcta
      if (isCorrect) {
        const temaActual = chatStorage.currentTopics.get(userId)
        if (temaActual) {
          const topicsProgressMap = chatStorage.topicsProgress.get(userId) || new Map()
          const topicData = topicsProgressMap.get(temaActual) || { progress: 0, completed: false }
          topicData.progress = Math.min(100, topicData.progress + 20)
          topicData.completed = topicData.progress >= 100
          topicsProgressMap.set(temaActual, topicData)
        }
      }
      
      // Guardar la respuesta del usuario
      const chatMessages = chatStorage.messages.get(userId) || []
      chatMessages.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      })
      
      // Guardar la respuesta del asistente
      chatMessages.push({
        role: 'assistant',
        content: isCorrect 
          ? `Respuesta correcta: ${lastQuiz.correctAnswer}. ${lastQuiz.explanation}`
          : `Respuesta incorrecta. La respuesta correcta es ${lastQuiz.correctAnswer}. ${lastQuiz.explanation}`,
        timestamp: new Date()
      })
      
      chatStorage.messages.set(userId, chatMessages)
      
      // Obtener XP actualizado
      const estudianteActualizado = await prisma.estudiante.findUnique({
        where: { id: userId }
      })
      
      return {
        text: isCorrect 
          ? "¡Excelente trabajo! Tu respuesta es correcta."
          : `Esa no es la respuesta correcta. La respuesta correcta es ${lastQuiz.correctAnswer}.`,
        messageType: 'quiz_response',
        answerFeedback: {
          isCorrect: isCorrect,
          selectedAnswer: userMessage,
          correctAnswer: lastQuiz.correctAnswer,
          feedback: lastQuiz.explanation
        },
        xp: estudianteActualizado?.xp || estudiante.xp
      }
    }

    // Para solicitudes de video
    if (userMessage.toLowerCase().includes('video') || 
        userMessage.toLowerCase().includes('multimedia') || 
        userMessage.toLowerCase().includes('ver') ||
        body.requestType === 'video') {
      
      const temaActual = chatStorage.currentTopics.get(userId)
      
      if (!temaActual) {
        return {
          text: "¿Sobre qué tema te gustaría ver un video? Por favor, selecciona primero un tema de estudio.",
          messageType: 'response'
        }
      }
      
      // Verificar límite de tasa
      if (!rateLimiter.canMakeRequest(userId)) {
        const waitTime = rateLimiter.getTimeUntilNextRequest(userId);
        return {
          status: 429,
          message: `Has alcanzado el límite de solicitudes. Por favor espera ${Math.ceil(waitTime / 1000)} segundos.`,
          waitTime,
          messageType: 'error'
        }
      }
      
      // Buscar videos relacionados con el tema usando la API de YouTube
      try {
        const videoData = await buscarVideoYouTube(temaActual)
        
        // Guardar mensaje en el almacenamiento
        const chatMessages = chatStorage.messages.get(userId) || []
        chatMessages.push({
          role: 'user',
          content: userMessage,
          timestamp: new Date()
        })
        
        chatMessages.push({
          role: 'assistant',
          content: `Aquí tienes un video sobre ${temaActual}: ${videoData.title} (https://www.youtube.com/watch?v=${videoData.videoId})`,
          timestamp: new Date()
        })
        
        chatStorage.messages.set(userId, chatMessages)
        
        // Actualizar progreso
        const topicsProgressMap = chatStorage.topicsProgress.get(userId) || new Map()
        const topicData = topicsProgressMap.get(temaActual) || { progress: 0, completed: false }
        topicData.progress = Math.min(100, topicData.progress + 5)
        topicsProgressMap.set(temaActual, topicData)
        
        return {
          text: `Aquí tienes un video educativo sobre ${temaActual}:`,
          messageType: 'video',
          videoData: videoData
        }
      } catch (error: any) {
        console.error('Error al buscar videos de YouTube:', error)
        return {
          text: `Lo siento, tuve un problema al buscar videos sobre ${temaActual}. Por favor, intenta de nuevo más tarde.`,
          messageType: 'response',
          error: error.message
        }
      }
    }

    // Para solicitudes de evaluación o quiz
    if (userMessage.toLowerCase().includes('quiz') || 
        userMessage.toLowerCase().includes('pregunta') || 
        userMessage.toLowerCase().includes('evalua') || 
        userMessage.toLowerCase().includes('test') ||
        body.requestType === 'quiz') {
      
      const temaActual = chatStorage.currentTopics.get(userId)
      
      if (!temaActual) {
        return {
          text: "Para generar preguntas de evaluación, primero necesito saber sobre qué tema quieres practicar. Por favor, selecciona un tema de estudio.",
          messageType: 'response'
        }
      }
      
      // Verificar límite de tasa
      if (!rateLimiter.canMakeRequest(userId)) {
        const waitTime = rateLimiter.getTimeUntilNextRequest(userId);
        return {
          status: 429,
          message: `Has alcanzado el límite de solicitudes. Por favor espera ${Math.ceil(waitTime / 1000)} segundos.`,
          waitTime,
          messageType: 'error'
        }
      }
      
      // Generar quiz con Gemini
      try {
        const model = genAI.getGenerativeModel({ model: modelName })
        const quizData = await generateQuiz(model, temaActual)
        
        // Guardar el quiz actual en el almacenamiento para verificar la respuesta después
        const quizKey = `${userId}_lastQuiz`
        chatStorage.quizzes.set(quizKey, {
          ...quizData,
          timestamp: new Date()
        })
        
        // Guardar mensajes en el almacenamiento
        const chatMessages = chatStorage.messages.get(userId) || []
        chatMessages.push({
          role: 'user',
          content: userMessage,
          timestamp: new Date()
        })
        
        // No guardamos la respuesta correcta ni la explicación en el mensaje visible
        chatMessages.push({
          role: 'assistant',
          content: `Pregunta: ${quizData.question}\n\nOpciones:\nA) ${quizData.options[0]}\nB) ${quizData.options[1]}\nC) ${quizData.options[2]}\nD) ${quizData.options[3]}`,
          timestamp: new Date()
        })
        
        chatStorage.messages.set(userId, chatMessages)
        
        return {
          text: "Aquí tienes una pregunta para evaluar tu conocimiento:",
          messageType: 'quiz',
          quiz: {
            question: quizData.question,
            options: quizData.options
            // No enviamos la respuesta correcta ni la explicación aquí
          }
        }
      } catch (error: any) {
        console.error('Error al generar quiz con Gemini:', error)
        
        // Manejar error de límite de tasa
        if (error.status === 429) {
          return {
            status: 429,
            message: 'Has alcanzado el límite de solicitudes de la API. Por favor, intenta de nuevo en unos minutos.',
            messageType: 'error',
            error: error.message
          }
        }
        
        return {
          text: `Lo siento, tuve un problema al generar preguntas sobre ${temaActual}. Por favor, intenta de nuevo más tarde.`,
          messageType: 'response',
          error: error.message
        }
      }
    }

    // Para cualquier otro mensaje, usar Gemini para generar respuesta
    try {
      // Verificar límite de tasa
      if (!rateLimiter.canMakeRequest(userId)) {
        const waitTime = rateLimiter.getTimeUntilNextRequest(userId);
        return {
          status: 429,
          message: `Has alcanzado el límite de solicitudes. Por favor espera ${Math.ceil(waitTime / 1000)} segundos.`,
          waitTime,
          messageType: 'error'
        }
      }
      
      const model = genAI.getGenerativeModel({ model: modelName })
      
      // Construir contexto para el modelo
      const temaActual = chatStorage.currentTopics.get(userId)
      const nivelEstudiante = Math.floor(estudiante.xp / 100) + 1 // Calcular nivel basado en XP
      
      const systemPrompt = `
        Eres un tutor educativo especializado en ayudar a estudiantes.
        
        Información del estudiante:
        - Nombre: ${estudiante.nombre}
        - Nivel: ${nivelEstudiante}
        ${temaActual ? `- Tema actual de estudio: ${temaActual}` : ''}
        
        Tu objetivo es:
        1. Proporcionar explicaciones claras y concisas
        2. Adaptar tus respuestas al nivel del estudiante
        3. Fomentar el pensamiento crítico
        4. Ser amigable y motivador
        
        Si el estudiante pregunta sobre un tema específico, proporciona información precisa y ejemplos.
        Si pide ejercicios, genera problemas adecuados a su nivel.
        Si necesita ayuda con un concepto, explícalo de manera sencilla.
        
        Responde de manera conversacional y natural, sin usar HTML ni estilos.
        Estructura tus respuestas con secciones claras y ejemplos paso a paso.
        
        Usa formato markdown para estructurar tu respuesta:
        - Usa ## para títulos de secciones
        - Usa listas numeradas para pasos
        - Usa **negrita** para términos importantes
        - Usa > para destacar información relevante
      `
      
      // CORREGIDO: Crear chat asegurando que el primer mensaje sea del usuario
      // Si no hay historial, crear uno con un mensaje inicial del usuario
      if (formattedHistory.length === 0) {
        formattedHistory = [
          {
            role: 'user',
            parts: [{ text: userMessage }]
          }
        ]
      } else {
        // Asegurarse de que el mensaje actual del usuario esté en el historial
        formattedHistory.push({
          role: 'user',
          parts: [{ text: userMessage }]
        })
      }
      
      // Crear chat con el historial formateado
      const chat = model.startChat({
        history: formattedHistory.slice(0, -1), // Excluir el último mensaje (que es el actual)
        generationConfig: {
          maxOutputTokens: maxOutputTokens,
        },
      })
      
      const result = await chat.sendMessage(systemPrompt + "\n\nMensaje del estudiante: " + userMessage)
      const responseText = result.response.text()
      
      // Guardar mensajes en el almacenamiento
      const chatMessages = chatStorage.messages.get(userId) || []
      chatMessages.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      })
      
      chatMessages.push({
        role: 'assistant',
        content: responseText,
        timestamp: new Date()
      })
      
      chatStorage.messages.set(userId, chatMessages)
      
      // Actualizar XP del estudiante por interacción
      await prisma.estudiante.update({
        where: { id: userId },
        data: { xp: { increment: 2 } }
      })
      
      // Obtener datos actualizados
      const estudianteActualizado = await prisma.estudiante.findUnique({
        where: { id: userId }
      })
      
      return {
        text: responseText,
        messageType: 'response',
        xp: estudianteActualizado?.xp || estudiante.xp
      }
    } catch (error: any) {
      console.error('Error al generar respuesta con Gemini:', error)
      
      // Manejar error de límite de tasa
      if (error.status === 429) {
        return {
          status: 429,
          message: 'Has alcanzado el límite de solicitudes de la API. Por favor, intenta de nuevo en unos minutos.',
          messageType: 'error',
          error: error.message
        }
      }
      
      return {
        text: 'Lo siento, tuve un problema al procesar tu mensaje. Por favor, intenta de nuevo más tarde.',
        messageType: 'response',
        error: error.message
      }
    }

  } catch (error: any) {
    console.error('Error en chat.post.ts:', error)
    return { 
      status: 500, 
      message: 'Error interno del servidor',
      error: error.message 
    }
  }
})
