"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, LogIn, LogOut, AlertCircle, CheckCircle } from "lucide-react"

interface ERPLoginProps {
  onConnectionChange: (isConnected: boolean, token?: string, clientId?: string) => void
}

export function ERPLogin({ onConnectionChange }: ERPLoginProps) {
  const [login, setLogin] = useState("")
  const [senha, setSenha] = useState("")
  const [clientId] = useState("89acf9c4-8a13-4561-8cd9-c1bd9d07cf71")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState("")
  const [token, setToken] = useState("")

  const handleAcessar = async () => {
    if (!login.trim() || !senha.trim()) {
      setError("Por favor, preencha login e senha")
      return
    }

    setIsConnecting(true)
    setError("")

    try {
      const authToken = await getAuthToken(login, senha, clientId)

      setToken(authToken)
      setIsConnected(true)
      onConnectionChange(true, authToken, clientId)

      console.log("[v0] Conexão ERP estabelecida com sucesso")
    } catch (err) {
      console.error("[v0] Erro na autenticação ERP:", err)
      setError("Erro ao conectar com o ERP. Verifique suas credenciais.")
      setIsConnected(false)
      onConnectionChange(false)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSair = () => {
    setLogin("")
    setSenha("")
    setToken("")
    setIsConnected(false)
    setError("")
    onConnectionChange(false)
    console.log("[v0] Desconectado do ERP")
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <LogIn className="w-5 h-5 text-emerald-600" />
          <span>Realizar validação com o ERP SeniorX</span>
        </CardTitle>
        <CardDescription>
          {isConnected
            ? "Conectado ao ERP. As validações via API estão ativas."
            : "Conecte-se ao ERP para validações avançadas via API"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="login">Login:</Label>
              <Input
                id="login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Digite seu login (ex: usuario@empresa.com.br)"
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha:</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Digite sua senha"
                disabled={isConnecting}
              />
            </div>

            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex space-x-3">
              <Button
                onClick={handleAcessar}
                disabled={isConnecting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Acessar
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800">
                Conectado ao ERP SeniorX com sucesso!
                <br />
                <span className="text-sm">Login: {login}</span>
              </AlertDescription>
            </Alert>

            <Button onClick={handleSair} variant="outline" className="w-full bg-transparent">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

async function getAuthToken(clienteLogin: string, clienteSenha: string, clientId: string): Promise<string> {
  try {
    const response = await fetch("/api/erp-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        login: clienteLogin,
        senha: clienteSenha,
        clientId: clientId,
      }),
    })

    if (!response.ok) {
      throw new Error(`Erro na autenticação: ${response.status}`)
    }

    const data = await response.json()
    return data.token
  } catch (error) {
    console.error("[v0] Erro ao obter token:", error)
    throw error
  }
}
