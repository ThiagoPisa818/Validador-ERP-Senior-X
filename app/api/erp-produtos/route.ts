export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token de autorização necessário" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const clientId = request.headers.get("client-id")

    if (!clientId) {
      return NextResponse.json({ error: "client_id necessário no header" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const codigoFamilia = searchParams.get("codFam")
    const codigoEmpresa = searchParams.get("codEmp")

    if (!codigoFamilia || !codigoEmpresa) {
      return NextResponse.json({ error: "codFam e codEmp são obrigatórios" }, { status: 400 })
    }

    console.log(`[v0] Consultando família ${codigoFamilia} e empresa ${codigoEmpresa} no ERP via e012fam`)

    const response = await fetch(
      `https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/erpx_fnd/produto/entities/e012fam?filter=codFam='${codigoFamilia}' and e070emp.codEmp=${codigoEmpresa}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          client_id: clientId,
          "Content-Type": "application/json",
        },
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.log(`[v0] Erro ao consultar família no ERP - status: ${response.status}, response: ${errorText}`)
      return NextResponse.json(
        { exists: false, error: `Erro ao consultar família: ${response.status}` },
        { status: response.status },
      )
    }

    const responseData = await response.json()
    console.log(`[v0] Resposta da API e012fam:`, JSON.stringify(responseData, null, 2))

    if (!responseData?.contents?.length) {
      console.log(`[v0] Família ${codigoFamilia} não encontrada para empresa ${codigoEmpresa}`)
      return NextResponse.json({ exists: false, error: "Família não encontrada para esta empresa" }, { status: 404 })
    }

    const familiaData = responseData.contents[0]
    const { codFam, desFam, posPro, e070emp } = familiaData

    if (!e070emp) {
      console.log(`[v0] Dados da empresa não encontrados na família ${codigoFamilia}`)
      return NextResponse.json({ exists: false, error: "Dados da empresa não encontrados" }, { status: 404 })
    }

    console.log(
      `[v0] Família encontrada - Código: ${codFam}, Descrição: ${desFam}, Empresa: ${e070emp.codEmp}, Posições: ${posPro}`,
    )

    return NextResponse.json({
      exists: true,
      familia: {
        codFam: codFam,
        codEmp: e070emp.codEmp,
        posPro: posPro || 23, // Default para 23 se não especificado
        desFam: desFam,
      },
      empresa: {
        codEmp: e070emp.codEmp,
        nomEmp: e070emp.nomEmp,
        sigEmp: e070emp.sigEmp,
      },
    })
  } catch (error) {
    console.error("[v0] Erro ao consultar família:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
