export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: { codigo: string } }) {
  try {
    const { codigo } = params
    const authHeader = request.headers.get("authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token de autorização necessário" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const clientId = request.headers.get("client-id")

    if (!clientId) {
      return NextResponse.json({ error: "client_id necessário no header" }, { status: 400 })
    }

    console.log(`[v0] Consultando produto ${codigo} no ERP via e075der`)

    const response = await fetch(
      `https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/erpx_fnd/produto/entities/e075der`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          client_id: clientId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          codDer: codigo,
        }),
      },
    )

    if (!response.ok) {
      console.log(`[v0] Produto ${codigo} não encontrado no ERP - status: ${response.status}`)
      return NextResponse.json({ exists: false, error: "Produto não encontrado" }, { status: 404 })
    }

    const responseData = await response.json()

    const familiaData = responseData.e012fam
    const empresaData = responseData.e070emp

    if (!familiaData || !empresaData) {
      console.log(`[v0] Produto ${codigo} encontrado mas sem dados de família ou empresa`)
      return NextResponse.json({ exists: false, error: "Dados de família ou empresa não encontrados" }, { status: 404 })
    }

    const { codFam, posPro } = familiaData
    const { codEmp } = empresaData

    console.log(
      `[v0] Produto encontrado: Código: ${codigo}, Família: ${codFam}, Empresa: ${codEmp}, Posições: ${posPro}`,
    )

    return NextResponse.json({
      exists: true,
      produto: {
        codDer: codigo,
        codFam,
        codEmp,
        posPro,
      },
    })
  } catch (error) {
    console.error("[v0] Erro ao consultar produto:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
