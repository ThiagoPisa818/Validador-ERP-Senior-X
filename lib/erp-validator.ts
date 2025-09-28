export interface ERPValidationContext {
  token: string
  isConnected: boolean
  clientId?: string
}

export async function consultarProdutoNoERP(
  codigoFamilia: string,
  codigoEmpresa: string,
  token: string,
  clientId?: string,
): Promise<{
  exists: boolean
  posPro?: number
  codEmp?: string
  codFam?: string
  error?: string
}> {
  try {
    console.log(`[v0] Consultando família ${codigoFamilia} e empresa ${codigoEmpresa} no ERP via e012fam`)

    const response = await fetch(
      `/api/erp-produtos?codFam=${encodeURIComponent(codigoFamilia)}&codEmp=${encodeURIComponent(codigoEmpresa)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "client-id": clientId || "",
          "Content-Type": "application/json",
        },
      },
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.log(`[v0] Família ${codigoFamilia} não encontrada no ERP: ${response.status}`)

      if (errorData.debug) {
        console.log(`[v0] Debug info - Famílias disponíveis: ${errorData.debug.familiasDisponiveis?.join(", ")}`)
        console.log(`[v0] Debug info - Empresas disponíveis: ${errorData.debug.empresasDisponiveis?.join(", ")}`)
      }

      return { exists: false, error: errorData.error || `Família não encontrada: ${response.status}` }
    }

    const familiaData = await response.json()

    if (!familiaData.exists) {
      console.log(`[v0] Família ${codigoFamilia} não existe no ERP para empresa ${codigoEmpresa}`)
      return { exists: false, error: familiaData.error || "Família não encontrada para esta empresa" }
    }

    const { codFam, codEmp, posPro } = familiaData.familia

    console.log(`[v0] Validação ERP bem-sucedida - Família: ${codFam}, Empresa: ${codEmp}, Posições: ${posPro}`)

    return {
      exists: true,
      posPro: posPro || 23, // Default para 23 se não especificado
      codEmp: codEmp?.toString(),
      codFam,
    }
  } catch (error) {
    console.error(`[v0] Erro ao consultar família no ERP:`, error)
    return { exists: false, error: "Erro na consulta ao ERP" }
  }
}

export async function consultarFamiliaNoERP(
  codigoFamilia: string,
  token: string,
): Promise<{
  exists: boolean
  posPro?: number
  codEmp?: string
  error?: string
}> {
  console.log(`[v0] DEPRECATED: consultarFamiliaNoERP - use consultarProdutoNoERP instead`)

  try {
    const response = await fetch(`/api/erp-familia/${codigoFamilia}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.log(`[v0] Família ${codigoFamilia} não encontrada no ERP: ${response.status}`)
      return { exists: false, error: `Erro na consulta: ${response.status}` }
    }

    const familiaData = await response.json()

    if (!familiaData.exists) {
      console.log(`[v0] Família ${codigoFamilia} não existe no ERP`)
      return { exists: false, error: "Família não encontrada" }
    }

    console.log(`[v0] Família ${codigoFamilia} encontrada - posPro: ${familiaData.familia.posPro}`)

    return {
      exists: true,
      posPro: familiaData.familia.posPro || 23,
      codEmp: familiaData.familia.codEmp,
    }
  } catch (error) {
    console.error(`[v0] Erro ao consultar família ${codigoFamilia}:`, error)
    return { exists: false, error: "Erro na consulta à família" }
  }
}

export function validateCodigoWithFamilia(
  codigo: string,
  codigoFamilia: string,
  codigoEmpresa: string,
  maxLength: number,
  expectedEmpresa?: string,
): { isValid: boolean; reason?: string } {
  if (!codigo || codigo.trim() === "") {
    return { isValid: false, reason: "Código não preenchido" }
  }

  if (expectedEmpresa && codigoEmpresa !== expectedEmpresa) {
    return {
      isValid: false,
      reason: `Código da empresa divergente (planilha: ${codigoEmpresa}, ERP: ${expectedEmpresa})`,
    }
  }

  if (codigo.length > maxLength) {
    return {
      isValid: false,
      reason: `Código excede o limite de caracteres da família ${codigoFamilia} (código: ${codigo.length} caracteres, máximo: ${maxLength})`,
    }
  }

  return { isValid: true }
}
