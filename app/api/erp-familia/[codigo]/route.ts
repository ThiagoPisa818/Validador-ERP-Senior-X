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

    console.log(`[v0] Consultando família ${codigo} no ERP`)

    const response = await fetch(
      `https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/erpx_fnd/produto/entities/e012fam?filter=codFam='${codigo}'`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (!response.ok) {
      console.log(`[v0] Família ${codigo} não encontrada no ERP - status: ${response.status}`)
      return NextResponse.json({ exists: false, error: "Família não encontrada" }, { status: 404 })
    }

    const responseData = await response.json()
    if (!responseData?.contents?.length) {
      console.log(`[v0] Família ${codigo} não encontrada - sem conteúdo`)
      return NextResponse.json({ exists: false, error: "Família não encontrada" }, { status: 404 })
    }

    const familiaData = responseData.contents[0]
    const { codFam, codEmp, posPro } = familiaData

    console.log(`[v0] Família encontrada: ${codFam}, Empresa: ${codEmp}, Posições: ${posPro}`)

    return NextResponse.json({
      exists: true,
      familia: { codFam, codEmp, posPro },
    })
  } catch (error) {
    console.error("[v0] Erro ao consultar família:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
