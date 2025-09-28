import { type NextRequest, NextResponse } from "next/server"

const FIXED_CREDENTIALS = {
  accessKey: "646ba53a-ffa3-4a77-b8e6-d4caca57fc00",
  secret: "d4f7202e-e254-4b16-a180-36cf469871cf",
  tenantName: "grebboind-homologcom",
}

export async function POST(request: NextRequest) {
  try {
    const { login, senha, clientId } = await request.json()

    if (!login || !senha) {
      return NextResponse.json({ error: "Login e senha são obrigatórios" }, { status: 400 })
    }

    if (!clientId) {
      return NextResponse.json({ error: "Client ID é obrigatório" }, { status: 400 })
    }

    const response = await fetch(
      "https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/platform/authentication/actions/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          client_id: clientId,
          "x-tenant-name": FIXED_CREDENTIALS.tenantName,
          "x-access-key": FIXED_CREDENTIALS.accessKey,
          "x-secret": FIXED_CREDENTIALS.secret,
        },
        body: JSON.stringify({
          username: login,
          password: senha,
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Erro na autenticação ERP:", response.status, errorText)
      return NextResponse.json({ error: "Credenciais inválidas ou Client ID incorreto" }, { status: 401 })
    }

    const authData = await response.json()
    console.log("[v0] Autenticação ERP bem-sucedida")

    let accessToken = null

    if (authData.jsonToken) {
      try {
        const tokenData = JSON.parse(authData.jsonToken)
        accessToken = tokenData.access_token
      } catch (parseError) {
        console.log("[v0] Erro ao parsear jsonToken:", parseError)
      }
    }

    // Fallback para outros formatos possíveis
    if (!accessToken) {
      accessToken = authData.access_token
    }

    if (!accessToken) {
      console.log("[v0] Token não encontrado na resposta:", authData)
      return NextResponse.json({ error: "Token não encontrado na resposta" }, { status: 500 })
    }

    console.log("[v0] Token extraído com sucesso")
    return NextResponse.json({
      token: accessToken,
      success: true,
    })
  } catch (error) {
    console.error("[v0] Erro no servidor de autenticação:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
