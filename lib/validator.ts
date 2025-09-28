export interface ValidationResult {
  isValid: boolean
  totalRecords: number
  processedRecords: number
  corrections: number
  excludedRecords: number
  correctedCsv: string
  correctionDetails: CorrectionDetail[]
  excludedDetails: ExcludedDetail[]
  processedDetails: ProcessedDetail[]
  // Optional downloads for PRODUTOS
  situacaoNCM?: string
  complementarProduto?: string
  // Optional downloads for PESSOAS
  clienteEspecializacao?: string
  representanteComercial?: string
}

interface CorrectionDetail {
  line: number
  field: string
  original: string
  corrected: string
  reason: string
}

interface ExcludedDetail {
  line: number
  reason: string
}

interface ProcessedDetail {
  line: number
  data: Record<string, string>
}

interface SpreadsheetTemplate {
  headers: string[]
  requiredFields: string[]
  validations: Record<
    string,
    (value: string, row?: Record<string, string>, allRows?: Record<string, string>[]) => string
  >
}

interface SpreadsheetConfig {
  headers: string[]
  requiredFields: string[]
  validations: Record<
    string,
    (value: string, row?: Record<string, string>, allRows?: Record<string, string>[]) => string
  >
}

// Import ERP validation types and functions
import type { ERPValidationContext } from "./erp-validator"
import { consultarProdutoNoERP, validateCodigoWithFamilia } from "./erp-validator"

const detectSeparator = (csvContent: string): string => {
  const firstLine = csvContent.split("\n")[0]
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  return semicolonCount > commaCount ? ";" : ","
}

const calculateLevel = (classification: string): number => {
  if (!classification) return 1
  return (classification.match(/\./g) || []).length + 1
}

const formatClassification = (classification: string, level: number): string => {
  if (!classification) return ""

  const parts = classification.split(".")
  const masks = [
    [1], // Level 1: X
    [1, 3], // Level 2: X.XXX
    [1, 3, 3], // Level 3: X.XXX.XXX
    [1, 3, 3, 3], // Level 4: X.XXX.XXX.XXX
    [1, 3, 3, 3, 3], // Level 5: X.XXX.XXX.XXX.XXX
    [1, 3, 3, 3, 3, 3], // Level 6: X.XXX.XXX.XXX.XXX.XXX
    [1, 3, 3, 3, 3, 3, 3], // Level 7: X.XXX.XXX.XXX.XXX.XXX.XXX
    [1, 3, 3, 3, 3, 3, 3, 3], // Level 8: X.XXX.XXX.XXX.XXX.XXX.XXX.XXX
    [1, 3, 3, 3, 3, 3, 3, 3, 3], // Level 9: X.XXX.XXX.XXX.XXX.XXX.XXX.XXX.XXX
  ]

  const mask = masks[level - 1]
  if (!mask) return classification

  const formattedParts = parts.map((part, index) => {
    if (index < mask.length) {
      return part.padStart(mask[index], "0")
    }
    return part
  })

  return formattedParts.join(".")
}

const getNextAvailableCode = (usedCodes: Set<string>, startFrom = 10): string => {
  let code = startFrom
  while (usedCodes.has(code.toString())) {
    code++
  }
  return code.toString()
}

export const SPREADSHEET_CONFIGS: Record<string, SpreadsheetConfig> = {
  pessoas: {
    headers: [
      "CODIGO",
      "NOME",
      "FANTASIA",
      "TIPO_PESSOA",
      "CNPJ_CPF",
      "NUMERO_RG",
      "DATA_EMISSAO_RG",
      "ORGAO_EMISSAO_RG",
      "INSCRICAO_ESTADUAL",
      "INSCRICAO_MUNICIPAL",
      "TIPO_MERCADO",
      "TIPO_ATIVIDADE",
      "BENEFICIO_FISCAL",
      "SUFRAMA",
      "VALIDADE_SUFRAMA",
      "CEP",
      "NUMERO_ENDERECO",
      "COMPLEMENTO_ENDERECO",
      "TELEFONE",
      "EMAIL",
      "DATA_NASCIMENTO",
      "SITUACAO",
      "CONSIDERA_FORNECEDOR",
      "CONSIDERA_CLIENTE",
      "CONSIDERA_REPRESENTANTE",
      "CONSIDERA_TRANSPORTADORA",
      "CONSIDERA_FAVORECIDO",
      "CODIGO_REGIME_TRIBUTARIO",
      "REGIME_ESPECIAL_TRIBUTACAO",
      "CONTRIBUINTE_ICMS",
      "PESSOA_INDUSTRIA",
      "RAMO_ATIVIDADE",
      "EMAIL_NFE",
    ],
    requiredFields: ["CODIGO", "NOME"],
    validations: {
      CODIGO: (value, row, allRows) => {
        const normalize = (v: any) => (v == null ? "" : String(v).trim())
        const parseNum = (s: string) => {
          const n = Number.parseInt(s, 10)
          return Number.isNaN(n) ? null : n
        }

        // 1) Build array of original numeric codes (null when not numeric)
        const originals = allRows.map((r) => parseNum(normalize(r?.CODIGO)))

        // 2) Build set of already-used numeric codes (unique values present in sheet)
        const used = new Set<number>()
        for (const n of originals) {
          if (n !== null) used.add(n)
        }

        // 3) Generator for next available code starting at 50 (skipping used)
        let nextCode = 50
        const getNextAvailable = () => {
          while (used.has(nextCode)) nextCode++
          used.add(nextCode)
          return String(nextCode++)
        }

        // 4) Build final assigned array deterministically, keeping first occurrence
        const seen = new Set<number>()
        const assigned: string[] = []
        for (let i = 0; i < originals.length; i++) {
          const n = originals[i]
          if (n === null) {
            // empty / non-numeric -> assign next available
            assigned.push(getNextAvailable())
          } else {
            if (!seen.has(n)) {
              // first occurrence -> keep original
              seen.add(n)
              assigned.push(String(n))
            } else {
              // duplicate occurrence -> replace
              assigned.push(getNextAvailable())
            }
          }
        }

        // 5) Try to locate the index of the current row robustly
        let rowIndex = allRows.indexOf(row)

        if (rowIndex === -1) {
          // fallback: try deep-equality by JSON (useful when row is a different object instance)
          try {
            const targetStr = JSON.stringify(row || {})
            rowIndex = allRows.findIndex((r) => JSON.stringify(r || {}) === targetStr)
          } catch (e) {
            rowIndex = -1
          }
        }

        // 6) Even if we still can't find it, try matching by value (first matching index)
        if (rowIndex === -1) {
          const v = normalize(value)
          if (v !== "") {
            rowIndex = allRows.findIndex((r) => normalize(r?.CODIGO) === v)
          }
        }

        // 7) Final fallback: if we found an index, return assigned[index]; otherwise:
        if (rowIndex !== -1) {
          return assigned[rowIndex]
        }

        // If we couldn't locate the row at all (very rare), be conservative:
        // - if the provided value is numeric and unique in the sheet, keep it;
        // - otherwise generate the next available code.
        const v = normalize(value)
        const vn = parseNum(v)
        if (vn !== null) {
          const occurrences = allRows.filter((r) => parseNum(normalize(r?.CODIGO)) === vn).length
          if (occurrences === 1) return String(vn)
        }
        return getNextAvailable()
      },

      NOME: (value) => value.substring(0, 100),
      FANTASIA: (value, row) => {
        const result = value || row?.NOME || ""
        return result.substring(0, 50)
      },
      TIPO_PESSOA: (value, row) => {
        const lower = value.toLowerCase()

        // Handle specific cases that should be validated based on CNPJ_CPF
        if (
          ["transportadora", "transportador", "cliente", "representante", "vendedor", "ambos"].includes(lower) ||
          !value
        ) {
          const cnpjCpf = row?.CNPJ_CPF?.replace(/\D/g, "") || ""

          if (cnpjCpf.length === 14) return "JURIDICA"
          if (cnpjCpf.length === 11) return "FISICA"
          return "JURIDICA" // Default when CNPJ_CPF is empty
        }

        // Handle standard mappings
        if (["pessoa física", "pessoa fisica", "cpf", "pf"].includes(lower)) return "FISICA"
        if (["pj", "jurídica", "juridica", "cnpj"].includes(lower)) return "JURIDICA"
        return value
      },
      CNPJ_CPF: (value, row) => {
        if (!value) return "" // Keep empty when not filled

        const numbers = value.replace(/\D/g, "")
        if (row?.TIPO_PESSOA === "FISICA") return numbers.padStart(11, "0").substring(0, 11)
        if (row?.TIPO_PESSOA === "JURIDICA") return numbers.padStart(14, "0").substring(0, 14)
        return numbers
      },
      INSCRICAO_ESTADUAL: (value) => value.replace(/[/\-.,:;]/g, "").replace(/\D/g, ""),
      INSCRICAO_MUNICIPAL: (value) => value.replace(/[/\-.,:;]/g, "").replace(/\D/g, ""),
      TIPO_MERCADO: (value) => {
        if (!value) return "INTERNO"
        const lower = value.toLowerCase()
        if (["i", "interno", "brasil", "nacional"].includes(lower)) return "INTERNO"
        if (["e", "ex", "externo", "exterior", "internacional"].includes(lower)) return "EXTERNO"
        return value
      },
      TIPO_ATIVIDADE: (value) => {
        const mappings: Record<string, string> = {
          outros: "OUTROS",
          "prestador serviço": "PRESTADOR_SERVICO",
          cooperativo: "COOPERATIVA",
          ind: "INDUSTRIA",
          comércio: "COMERCIO",
          imobiliaria: "ATIVIDADE_IMOBILIARIA",
          comercio: "COMERCIO",
        }
        return mappings[value.toLowerCase()] || value
      },
      BENEFICIO_FISCAL: (value) => {
        if (!value) return ""
        const validValues = [
          "NAO_POSSUI",
          "ZONA_FRANCA_MANAUS",
          "ZONA_FRANCA",
          "AREA_LIVRE_COMERCIO",
          "AMAZONIA_OCIDENTAL",
        ]
        return validValues.includes(value) ? value : "NAO_POSSUI"
      },
      CEP: (value) => {
        if (!value || value.trim() === "") return "" // Keep empty when not filled
        const numbers = value.replace(/\D/g, "")
        return numbers.length <= 8 ? numbers.padStart(8, "0") : ""
      },
      NUMERO_ENDERECO: (value) => value.replace(/\D/g, ""),
      COMPLEMENTO_ENDERECO: (value) => value.substring(0, 20),
      TELEFONE: (value) => value.replace(/[().\-\s]/g, ""),
      EMAIL: (value) => {
        if (!value) return ""
        let emails = value
          .replace(/[,\s+/]/g, ";")
          .split(";")
          .filter((email) => email.trim())
        emails = emails.map((email) => email.substring(0, 60))
        const result = emails.join(";")
        return result.substring(0, 100)
      },
      CODIGO_REGIME_TRIBUTARIO: (value) => {
        const lower = value.toLowerCase()
        if (["simples", "microempresa", "empresario", "microempresario", "simples nacional"].includes(lower))
          return "SIMPLES"
        if (["real", "lucro real", "normal"].includes(lower)) return "NORMAL"
        return value || "SIMPLES"
      },
      EMAIL_NFE: (value) => {
        if (!value) return ""
        let emails = value
          .replace(/[,\s+/]/g, ";")
          .split(";")
          .filter((email) => email.trim())
        emails = emails.map((email) => email.substring(0, 60))
        const result = emails.join(";")
        return result.substring(0, 100)
      },
      SITUACAO: (value) => {
        if (!value || value.trim() === "") return "ATIVO"
        const lower = value.toLowerCase()
        if (["ativo", "ativa", "a", "sim", "s", "1", "true"].includes(lower)) return "ATIVO"
        if (["inativo", "inativa", "i", "não", "nao", "n", "0", "false"].includes(lower)) return "INATIVO"
        return "ATIVO" // Default to ATIVO if value is not understood
      },
      REGIME_ESPECIAL_TRIBUTACAO: (value) => {
        if (!value || value.trim() === "") return ""

        const lower = value.toLowerCase().trim()

        // Map specific values to standardized codes
        if (["micro", "micro empresa", "microempresa"].includes(lower)) return "MICRO_EMPRESA"
        if (["me epp", "me", "meepp"].includes(lower)) return "ME_EPP"
        if (["sociedade"].includes(lower)) return "SOCIEDADE"
        if (["estimativa"].includes(lower)) return "ESTIMATIVA"
        if (["cooperativa"].includes(lower)) return "COOPERATIVA"

        // If not understood, clear the field
        return ""
      },
      DATA_NASCIMENTO: (value, row) => {
        if (row?.TIPO_PESSOA === "JURIDICA") return ""
        return value || ""
      },
      NUMERO_RG: (value, row) => {
        if (row?.TIPO_PESSOA === "JURIDICA") return ""
        return value || ""
      },
      CONSIDERA_FORNECEDOR: (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        return "NAO"
      },
      CONSIDERA_CLIENTE: (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        return "NAO"
      },
      CONSIDERA_REPRESENTANTE: (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        return "NAO"
      },
      CONSIDERA_TRANSPORTADORA: (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        return "NAO"
      },
      CONSIDERA_FAVORECIDO: (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        return "NAO"
      },
      CONTRIBUINTE_ICMS: (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        return "NAO"
      },
      PESSOA_INDUSTRIA: (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        return "NAO"
      },
      RAMO_ATIVIDADE: (value) => {
        return value.length > 5 ? "" : value
      },
    },
  },
  produtos: {
    headers: [
      "Código",
      "Descrição",
      "GTIN unidade tributável",
      "Situação",
      "Peso líquido (kg)",
      "Peso bruto (kg)",
      "Comprimento (cm)",
      "Largura (cm)",
      "Altura (cm)",
      "Código da marca",
      "Código da empresa",
      "Código da família",
      "Pode ser vendido",
      "Número do registro na Anvisa",
      "Código da unidade de medida de venda",
      "Código do produto ANP",
      "Descrição do produto conforme ANP",
      "Origem fiscal da mercadoria",
      "Tipo do produto para impostos",
      "Controlar ICMS ST Substituído e FCI Comércio pelo método do estoque PEPS",
      "Especificador de substituição tributária",
      "NCM",
      "Pode ser requisitado",
      "Preço de custo",
      "Código da unidade de medida de estoque",
      "Depósito - Código da filial",
      "Depósito - Código do depósito",
      "Código da unidade de medida auxiliar de estoque",
      "Pode ser comprado",
    ],
    requiredFields: [
      "Código",
      "Código da empresa",
      "Código da família",
      "Código da unidade de medida de estoque",
      "Depósito - Código da filial",
    ],
    validations: {
      Código: (value) => (value.length > 23 ? "" : value),
      Descrição: (value) => value.replace(/[*#$%@&<>^|~]/g, "").substring(0, 120),
      Situação: (value) => {
        const lower = value.toLowerCase()
        if (["ativo", "a", "sim"].includes(lower)) return "ATIVO"
        if (["inativo", "i", "inativa", "não", "nao"].includes(lower)) return "INATIVO"
        return value
      },
      "Número do registro na Anvisa": (value) => {
        if (!value) return "" // Keep empty when not filled

        // Remove special characters and letters, keep only numbers
        const numbers = value.replace(/[,./\-;?_a-zA-Z]/g, "")

        if (numbers.length === 0) return ""
        if (numbers.length > 13) return "" // Reject if more than 13 characters

        // Pad with zeros to the left to reach 13 characters
        return numbers.padStart(13, "0")
      },
      "Origem fiscal da mercadoria": (value) => {
        const lower = value.toLowerCase()
        if (["nacional", "brasil"].includes(lower)) return "0"
        if (["estrangeira", "internacional", "importado"].includes(lower)) return "1"
        return value
      },
      NCM: (value) => {
        if (!value || value.trim() === "") return "" // Keep empty when not filled
        const numbers = value.replace(/\D/g, "")
        return numbers.padStart(8, "0").substring(0, 8)
      },
      "Preço de custo": (value) => {
        if (!value || value === "N/A") return ""
        // Replace dots with commas for decimal separation
        return value.toString().replace(/\./g, ",")
      },
      "Peso líquido (kg)": (value) => {
        if (!value) return ""
        return value.toString().replace(/\./g, ",")
      },
      "Peso bruto (kg)": (value) => {
        if (!value) return ""
        return value.toString().replace(/\./g, ",")
      },
      "Comprimento (cm)": (value) => {
        if (!value) return ""
        return value.toString().replace(/\./g, ",")
      },
      "Largura (cm)": (value) => {
        if (!value) return ""
        return value.toString().replace(/\./g, ",")
      },
      "Depósito - Código do depósito": (value) => value || "1-200",
      "Pode ser vendido": (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes", "pode"].includes(lower)) return "SIM"
        return "NAO"
      },
      "Pode ser requisitado": (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes", "pode"].includes(lower)) return "SIM"
        return "NAO"
      },
      "Pode ser comprado": (value) => {
        if (!value) return "NAO"
        const lower = value.toLowerCase()
        if (["sim", "s", "yes", "pode"].includes(lower)) return "SIM"
        return "NAO"
      },
    },
  },
  plano_financeiro: {
    headers: [
      "codigoconta",
      "classificacao",
      "descricao",
      "abreviatura",
      "codigodotipofinanceiro",
      "analiticasintetica",
      "natureza",
      "nivel",
      "contacontabilvinculada",
    ],
    requiredFields: ["classificacao", "descricao"],
    validations: {
      classificacao: (value) => {
        if (!value) return ""
        const level = calculateLevel(value)
        return formatClassification(value, level)
      },
      descricao: (value) => value.replace(/[*#$%@&<>^|~]/g, "").substring(0, 100),
      abreviatura: (value, row) => {
        const result = value || row?.descricao || ""
        return result.substring(0, 20)
      },
      codigodotipofinanceiro: (value, row) => {
        const mappings: Record<string, string> = {
          "despesas financeiras": "1",
          despesas: "1",
          despesa: "1",
          "receitas financeiras": "2",
          receita: "2",
          receitas: "2",
          "receita financeira": "2",
        }
        const mapped = mappings[value.toLowerCase()]
        if (mapped) return mapped
        if (!value) {
          return row?.natureza === "DEVEDORA" ? "1" : "2"
        }
        return ["1", "2"].includes(value) ? value : "1"
      },
      analiticasintetica: (value) => {
        const lower = value.toLowerCase()
        if (["sintetico", "sintético", "sintetica", "sintética"].includes(lower)) return "SINTETICA"
        if (["analitico", "analítico", "analitica", "analítica"].includes(lower)) return "ANALITICA"
        return value
      },
      natureza: (value, row) => {
        const lower = value.toLowerCase()
        if (["credor", "credora"].includes(lower)) return "CREDORA"
        if (["devedor", "devedora"].includes(lower)) return "DEVEDORA"
        if (["ambas", "ambos"].includes(lower)) return "AMBAS"
        if (!value) {
          return row?.codigodotipofinanceiro === "1" ? "DEVEDORA" : "CREDORA"
        }
        return value
      },
      nivel: (value, row) => {
        const calculatedLevel = calculateLevel(row?.classificacao || "")
        if (!value || Number.parseInt(value) !== calculatedLevel) {
          return calculatedLevel.toString()
        }
        return value
      },
    },
  },
  plano_contabil: {
    headers: [
      "codigoconta",
      "classificacao",
      "descricao",
      "abreviatura",
      "definicaodegrupo",
      "analiticasintetica",
      "natureza",
      "nivel",
      "formaderateio",
      "exigecontaauxiliar",
      "aceitalancamentomanual",
    ],
    requiredFields: ["classificacao", "descricao"],
    validations: {
      classificacao: (value) => {
        if (!value) return ""
        const level = calculateLevel(value)
        return formatClassification(value, level)
      },
      descricao: (value) => value.replace(/[*#$%@&<>^|~]/g, "").substring(0, 100),
      abreviatura: (value, row) => {
        const result = value || row?.descricao || ""
        return result.substring(0, 20)
      },
      definicaodegrupo: (value) => {
        const mappings: Record<string, string> = {
          ativa: "ATIVO",
          ativo: "ATIVO",
          passivo: "PASSIVO",
          passiva: "PASSIVO",
          liquido: "PATRIMONIO_LIQUIDO",
          "patrimonio liquido": "PATRIMONIO_LIQUIDO",
          "patrimônio liquido": "PATRIMONIO_LIQUIDO",
          "contas resultado": "CONTAS_RESULTADO",
          "conta resultado": "CONTAS_RESULTADO",
          resultados: "CONTAS_RESULTADO",
          resultado: "CONTAS_RESULTADO",
          "conta compensação": "CONTAS_COMPENSACAO",
          "contas compensação": "CONTAS_COMPENSACAO",
          compensação: "CONTAS_COMPENSACAO",
          outro: "OUTROS",
          outros: "OUTROS",
          outra: "OUTROS",
          outras: "OUTROS",
        }
        return mappings[value.toLowerCase()] || value || "OUTROS"
      },
      analiticasintetica: (value) => {
        const lower = value.toLowerCase()
        if (["sintetico", "sintético", "sintetica", "sintética"].includes(lower)) return "SINTETICA"
        if (["analitico", "analítico", "analitica", "analítica"].includes(lower)) return "ANALITICA"
        return value
      },
      natureza: (value, row) => {
        const lower = value.toLowerCase()

        // Handle standard mappings first
        if (["credor", "credora"].includes(lower)) return "CREDORA"
        if (["devedor", "devedora"].includes(lower)) return "DEVEDORA"
        if (["ambas", "ambos"].includes(lower) && row?.analiticasintetica !== "SINTETICA") return "AMBAS"

        // Apply complex validation when empty, invalid, or AMBOS with SINTETICA
        if (
          !value ||
          !["CREDORA", "DEVEDORA", "AMBAS"].includes(value) ||
          (value === "AMBOS" && row?.analiticasintetica === "SINTETICA")
        ) {
          const definicao = row?.definicaodegrupo || ""
          const descricao = (row?.descricao || "").toLowerCase()

          // Check if account is reducing (contains "(-)" or "( - )")
          const isReducing = descricao.includes("(-)") || descricao.includes("( - )")

          // Base rules
          if (definicao === "ATIVO") {
            return isReducing ? "CREDORA" : "DEVEDORA"
          }

          if (["PASSIVO", "CONTAS_RESULTADO", "PATRIMONIO_LIQUIDO"].includes(definicao)) {
            return isReducing ? "DEVEDORA" : "CREDORA"
          }

          // Description-based rules
          if (
            descricao.includes("despesa") ||
            descricao.includes("custo") ||
            descricao.includes("resultado") ||
            descricao.includes("provisão")
          ) {
            return "DEVEDORA"
          }

          if (descricao.includes("receita")) {
            return isReducing ? "CREDORA" : "CREDORA"
          }

          // Default fallback
          return "DEVEDORA"
        }

        return value
      },
      nivel: (value, row) => {
        const calculatedLevel = calculateLevel(row?.classificacao || "")
        if (!value || Number.parseInt(value) !== calculatedLevel) {
          return calculatedLevel.toString()
        }
        return value
      },
      formaderateio: (value, row) => {
        const lower = value.toLowerCase()

        // Handle standard mappings first
        if (["sem rateio", "sem", "não", "nao"].includes(lower)) return "SEM_RATEIO"
        if (["com rateio", "sim", "rateio manual", "manual"].includes(lower)) return "RATEIO_MANUAL"

        // Apply validation when empty or invalid
        if (!value || !["SEM_RATEIO", "RATEIO_MANUAL"].includes(value)) {
          const definicao = row?.definicaodegrupo || ""
          const analiticasintetica = row?.analiticasintetica || ""

          // Business rules
          if (["ATIVO", "PASSIVO", "PATRIMONIO_LIQUIDO"].includes(definicao)) {
            return "SEM_RATEIO"
          }

          if (definicao === "CONTAS_RESULTADO") {
            return "RATEIO_MANUAL"
          }

          if (analiticasintetica === "SINTETICA") {
            return "SEM_RATEIO"
          }

          return "SEM_RATEIO" // Default
        }

        return value
      },
      exigecontaauxiliar: (value) => {
        return "NAO" // Always NAO as default
      },
      aceitalancamentomanual: (value) => {
        if (!value) return "NAO"

        const lower = value.toLowerCase()
        if (["sim", "s", "yes"].includes(lower)) return "SIM"
        if (["não", "nao", "no", "n"].includes(lower)) return "NAO"

        return "NAO" // Default when not understood
      },
    },
  },
  centro_custo: {
    headers: [
      "codigodocentrodecusto",
      "classificacao",
      "descricao",
      "abreviatura",
      "analiticasintetica",
      "natureza",
      "tipodocentrodecusto",
      "nivel",
    ],
    requiredFields: ["classificacao", "descricao"],
    validations: {
      classificacao: (value) => {
        if (!value) return ""
        const level = calculateLevel(value)
        if (level > 5) {
          return ""
        }
        return formatClassification(value, level)
      },
      descricao: (value) => value.replace(/[*#$%@&<>^|~]/g, "").substring(0, 100),
      abreviatura: (value, row) => {
        const result = value || row?.descricao || ""
        return result.substring(0, 20)
      },
      analiticasintetica: (value) => {
        const lower = value.toLowerCase()
        if (["sintetico", "sintético", "sintetica", "sintética"].includes(lower)) return "SINTETICA"
        if (["analitico", "analítico", "analitica", "analítica"].includes(lower)) return "ANALITICA"
        return value
      },
      natureza: (value) => {
        const lower = value.toLowerCase()
        if (["credor", "credora"].includes(lower)) return "CREDORA"
        if (["devedor", "devedora"].includes(lower)) return "DEVEDORA"
        if (["ambas", "ambos"].includes(lower)) return "AMBAS"
        return value || "DEVEDORA"
      },
      tipodocentrodecusto: (value) => {
        const mappings: Record<string, string> = {
          administrativa: "ADMINISTRATIVO",
          adm: "ADMINISTRATIVO",
          admin: "ADMINISTRATIVO",
          administrativo: "ADMINISTRATIVO",
          "operacional indireto": "OPERACIONAL_INDIRETO",
          indireto: "OPERACIONAL_INDIRETO",
          "operacional direto": "OPERACIONAL_DIRETO",
          direto: "OPERACIONAL_DIRETO",
          operacional: "OPERACIONAL_DIRETO",
          comercial: "COMERCIAL",
          finança: "FINANCEIRO",
          finanças: "FINANCEIRO",
          financeira: "FINANCEIRO",
          financeiro: "FINANCEIRO",
        }
        return mappings[value.toLowerCase()] || value || "ADMINISTRATIVO"
      },
      nivel: (value, row) => {
        const calculatedLevel = calculateLevel(row?.classificacao || "")
        if (calculatedLevel > 5) {
          return ""
        }
        if (!value || Number.parseInt(value) !== calculatedLevel) {
          return calculatedLevel.toString()
        }
        return value
      },
    },
  },
  titulos_receber: {
    headers: [
      "EMPRESA",
      "FILIAL",
      "NUMERO_TITULO",
      "TIPO_TITULO",
      "CLIENTE",
      "CNPJ_CPF",
      "SACADO",
      "VALOR",
      "FORMA_PAGAMENTO",
      "TRANSACAO",
      "DATA_EMISSAO",
      "DATA_ENTRADA",
      "VENCIMENTO",
      "PRORROGA_JUROS",
      "PERCENTUAL_DESCONTO",
      "VALOR_DESCONTO",
      "PORTADOR",
      "CARTEIRA",
      "TIPO_JUROS",
      "PERCENTUAL_JUROS",
      "PERCENTUAL_MULTA",
      "MOEDA",
      "COTACAO_MOEDA",
      "OBSERVACAO",
      "NUMERO_CHEQUE",
      "NOSSO_NUMERO",
      "CONTA_FINANCEIRA",
      "CENTRO_CUSTO",
    ],
    requiredFields: ["EMPRESA", "FILIAL", "NUMERO_TITULO", "VALOR"],
    validations: {
      NUMERO_TITULO: (value) => value.substring(0, 15),
      VALOR: (value) => {
        const cleanValue = value.replace(",", ".")
        const numValue = Number.parseFloat(cleanValue)
        return isNaN(numValue) ? "" : numValue.toFixed(2)
      },
      CNPJ_CPF: (value) => {
        if (!value || value.trim() === "") return ""
        const numbers = value.replace(/\D/g, "")
        if (numbers.length <= 11) return numbers.padStart(11, "0")
        return numbers.padStart(14, "0").substring(0, 14)
      },
      MOEDA: (value) => {
        const mappings: Record<string, string> = {
          real: "BRL",
          euro: "EUR",
          peso: "ARS",
          dólar: "USD",
          "peso chileno": "CLP",
          "peso argentino": "ARS",
          "peso filipino": "PHP",
          "peso mexicano": "MXN",
          r$: "BRL",
        }
        return mappings[value.toLowerCase()] || value || "BRL"
      },
      TIPO_TITULO: (value) => (value.length > 3 ? "NFS" : value || "NFS"),
      TRANSACAO: (value) => value || "90300",
      DATA_ENTRADA: (value, row) => {
        if (!value) {
          const today = new Date()
          return `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`
        }

        // Check if DATA_ENTRADA is earlier than DATA_EMISSAO
        if (row?.DATA_EMISSAO && value) {
          const [dayEntrada, monthEntrada, yearEntrada] = value.split("/").map(Number)
          const [dayEmissao, monthEmissao, yearEmissao] = row.DATA_EMISSAO.split("/").map(Number)

          const dataEntrada = new Date(yearEntrada, monthEntrada - 1, dayEntrada)
          const dataEmissao = new Date(yearEmissao, monthEmissao - 1, dayEmissao)

          if (dataEntrada < dataEmissao) {
            return row.DATA_EMISSAO
          }
        }

        return value
      },
      DATA_EMISSAO: (value) => value || "",
      VENCIMENTO: (value) => {
        if (!value) {
          const today = new Date()
          return `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`
        }
        return value
      },
      PORTADOR: (value) => {
        if (!value) return "999"
        return value.length > 3 ? "999" : value.padStart(3, "0")
      },
      CARTEIRA: (value) => {
        if (!value) return "99"
        return value.length > 2 ? "99" : value.padStart(2, "0")
      },
    },
  },
  titulos_pagar: {
    headers: [
      "EMPRESA",
      "FILIAL",
      "NUMERO_TITULO",
      "TIPO_TITULO",
      "FORNECEDOR",
      "CNPJ_CPF",
      "FAVORECIDO",
      "VALOR",
      "FORMA_PAGAMENTO",
      "TRANSACAO",
      "DATA_EMISSAO",
      "DATA_ENTRADA",
      "VENCIMENTO",
      "PRORROGA_JUROS",
      "PERCENTUAL_DESCONTO",
      "VALOR_DESCONTO",
      "PORTADOR",
      "CARTEIRA",
      "TIPO_JUROS",
      "PERCENTUAL_JUROS",
      "PERCENTUAL_MULTA",
      "MOEDA",
      "COTACAO_MOEDA",
      "OBSERVACAO",
      "CONTA_FINANCEIRA",
      "CENTRO_CUSTO",
    ],
    requiredFields: ["EMPRESA", "FILIAL", "NUMERO_TITULO", "VALOR"],
    validations: {
      NUMERO_TITULO: (value) => value.substring(0, 15),
      VALOR: (value) => {
        const cleanValue = value.replace(",", ".")
        const numValue = Number.parseFloat(cleanValue)
        return isNaN(numValue) ? "" : numValue.toFixed(2)
      },
      CNPJ_CPF: (value) => {
        if (!value || value.trim() === "") return ""
        const numbers = value.replace(/\D/g, "")
        if (numbers.length <= 11) return numbers.padStart(11, "0")
        return numbers.padStart(14, "0").substring(0, 14)
      },
      MOEDA: (value) => {
        const mappings: Record<string, string> = {
          real: "BRL",
          euro: "EUR",
          peso: "ARS",
          dólar: "USD",
          "peso chileno": "CLP",
          "peso argentino": "ARS",
          "peso filipino": "PHP",
          "peso mexicano": "MXN",
          r$: "BRL",
        }
        return mappings[value.toLowerCase()] || value || "BRL"
      },
      TIPO_TITULO: (value) => (value.length > 3 ? "NFC" : value || "NFC"),
      TRANSACAO: (value) => value || "90500",
      DATA_ENTRADA: (value, row) => {
        if (!value) {
          const today = new Date()
          return `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`
        }

        // Check if DATA_ENTRADA is earlier than DATA_EMISSAO
        if (row?.DATA_EMISSAO && value) {
          const [dayEntrada, monthEntrada, yearEntrada] = value.split("/").map(Number)
          const [dayEmissao, monthEmissao, yearEmissao] = row.DATA_EMISSAO.split("/").map(Number)

          const dataEntrada = new Date(yearEntrada, monthEntrada - 1, dayEntrada)
          const dataEmissao = new Date(yearEmissao, monthEmissao - 1, dayEmissao)

          if (dataEntrada < dataEmissao) {
            return row.DATA_EMISSAO
          }
        }

        return value
      },
      DATA_EMISSAO: (value) => value || "",
      VENCIMENTO: (value) => {
        if (!value) {
          const today = new Date()
          return `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`
        }
        return value
      },
      PORTADOR: (value) => {
        if (!value) return "999"
        return value.length > 3 ? "999" : value.padStart(3, "0")
      },
      CARTEIRA: (value) => {
        if (!value) return "99"
        return value.length > 2 ? "99" : value.padStart(2, "0")
      },
    },
  },
  tabela_preco_venda: {
    headers: [
      "TIPO_ITEM",
      "CODIGO",
      "UNIDADE_MEDIDA",
      "CONDICAO_PAGAMENTO",
      "QTD_MAXIMA",
      "VALOR_BASE",
      "PERCENTUAL_DESCONTO",
      "PERCENTUAL_COMISSAO",
      "OBSERVACAO",
    ],
    requiredFields: ["TIPO_ITEM", "CODIGO", "UNIDADE_MEDIDA", "VALOR_BASE"],
    validations: {
      TIPO_ITEM: (value) => (["VP", "VS"].includes(value) ? value : ""),
    },
  },
  tabela_preco_compra: {
    headers: [
      "TIPO",
      "COD_ITEM",
      "COD_ITEM_FORNECEDOR",
      "UNIDADE_MEDIDA",
      "COD_CONDICAO_PAGAMENTO",
      "QUANTIDADE_MAXIMA",
      "PRECO_BASE",
      "PERCENTUAL_DESCONTO",
      "OBSERVACAO",
    ],
    requiredFields: ["TIPO", "COD_ITEM", "UNIDADE_MEDIDA", "PRECO_BASE"],
    validations: {
      TIPO: (value) => (["VP", "VS"].includes(value) ? value : ""),
      COD_ITEM: (value) => value.substring(0, 23),
      COD_ITEM_FORNECEDOR: (value) => value.substring(0, 30),
      UNIDADE_MEDIDA: (value) => value.substring(0, 6),
      COD_CONDICAO_PAGAMENTO: (value) => value.substring(0, 6),
      OBSERVACAO: (value) => value.substring(0, 220),
    },
  },
  saldo_inicial_estoque: {
    headers: [
      "CODIGO_EMPRESA",
      "CODIGO_FILIAL",
      "CODIGO_PRODUTO",
      "CODIGO_DEPOSITO",
      "CODIGO_TRANSACAO_ESTOQUE",
      "QUANTIDADE",
      "VALOR",
      "NUMERO_SERIE",
      "CODIGO_LOTE",
      "DATA_FABRICACAO_LOTE_SERIE",
      "DATA_VALIDADE_LOTE_SERIE",
    ],
    requiredFields: ["CODIGO_EMPRESA", "CODIGO_FILIAL", "CODIGO_PRODUTO"],
    validations: {
      CODIGO_DEPOSITO: (value) => value || "1-200",
      CODIGO_TRANSACAO_ESTOQUE: (value) => value || "90222",
    },
  },
}

const templates: Record<string, SpreadsheetTemplate> = SPREADSHEET_CONFIGS

const parseCSVLine = (line: string, separator: string): string[] => {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i += 2
        continue
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
        i++
        continue
      }
    }

    if (char === separator && !inQuotes) {
      // Field separator outside quotes
      result.push(current.trim())
      current = ""
      i++
      continue
    }

    current += char
    i++
  }

  // Add the last field
  result.push(current.trim())
  return result
}

const generateSituacaoNCM = (validRows: Record<string, string>[]): string => {
  const uniqueNCMs = new Set<string>()

  validRows.forEach((row) => {
    const ncm = row["NCM"]
    if (ncm && ncm.trim() !== "") {
      uniqueNCMs.add(ncm.trim())
    }
  })

  const headers = ["Código", "Situação"]
  const csvLines = [headers.join(";")]

  Array.from(uniqueNCMs)
    .sort()
    .forEach((ncm) => {
      csvLines.push(`${ncm};Ativo`)
    })

  return csvLines.join("\n")
}

const generateComplementarProduto = (validRows: Record<string, string>[]): string => {
  const headers = [
    "Código da empresa",
    "Código do produto",
    "Descrição complementar",
    "Código de barras",
    "Código de barras livre",
    "Identificador do produto",
    "Código de referência",
    "Observação",
    "Descrição para nota fiscal",
    "Informação adicional",
    "Pode ser vendido no eCommerce",
    "Dias para validade",
  ]

  const csvLines = [headers.join(";")]

  validRows.forEach((row) => {
    const line = [
      row["Código da empresa"] || "",
      row["Código"] || "",
      "", // Descrição complementar - blank
      "", // Código de barras - blank
      "", // Código de barras livre - blank
      "", // Identificador do produto - blank
      "", // Código de referência - blank
      "", // Observação - blank
      row["Descrição"] || "",
      "", // Informação adicional - blank
      "", // Pode ser vendido no eCommerce - blank
      "", // Dias para validade - blank
    ]
    csvLines.push(line.join(";"))
  })

  return csvLines.join("\n")
}

const generateClienteEspecializacao = (validRows: Record<string, string>[]): string => {
  const headers = [
    "EMPRESA",
    "FILIAL",
    "CODIGO_CLIENTE",
    "CONDICAO_PAGAMENTO",
    "REPRESENTANTE",
    "TRANSPORTADORA",
    "CONSUMIDOR_FINAL",
    "SITUACAO",
  ]

  const csvLines = [headers.join(";")]

  validRows.forEach((row) => {
    // Only include records where CONSIDERA_CLIENTE is "SIM"
    if (row["CONSIDERA_CLIENTE"] === "SIM") {
      const clienteRow = [
        "1", // EMPRESA
        "1", // FILIAL
        row["CODIGO"] || "", // CODIGO_CLIENTE
        "", // CONDICAO_PAGAMENTO (blank)
        "", // REPRESENTANTE (blank)
        "", // TRANSPORTADORA (blank)
        "NAO", // CONSUMIDOR_FINAL
        "ATIVO", // SITUACAO
      ]
      csvLines.push(clienteRow.join(";"))
    }
  })

  return csvLines.join("\n")
}

const generateRepresentanteComercial = (validRows: Record<string, string>[]): string => {
  const headers = [
    "CODIGO_REPRESENTANTE",
    "CODIGO_EMPRESA",
    "CODIGO_FILIAL",
    "CATEGORIA_REPRESENTANTE",
    "VALOR_MIN_PEDIDO",
    "PERC_COMISSAO_PADRAO_PRODUTO",
    "PERC_COMISSAO_PADRAO_SERVICO",
    "PERC_COMISSAO_PAGO_FATURAMENTO",
    "ENCARGOS_NA_BASE_COMISSAO",
    "OUTRAS_DESPESAS_NA_BASE_COMISSAO",
    "VLR_EMBALAGENS_NA_BASE_COMISSAO",
    "SEGURO_NA_BASE_COMISSAO",
    "FRETE_NA_BASE_COMISSAO",
    "IPI_NA_BASE_COMISSAO",
    "ICMS_NA_BASE_COMISSAO",
    "ICMS_SUBS_NA_BASE_COMISSAO",
    "INSS_NA_BASE_COMISSAO",
    "ISS_NA_BASE_COMISSAO",
    "COFINS_FAT_NA_BASE_COMISSAO",
    "COFINS_RET_NA_BASE_COMISSAO",
    "PIS_FAT_NA_BASE_COMISSAO",
    "PIS_RET_NA_BASE_COMISSAO",
    "IRRF_NA_BASE_COMISSAO",
    "CSLL_NA_BASE_COMISSAO",
    "CODIGO_TABELA_PRECO_PADRAO",
    "PERC_COMISSAO_PAGO_REC_TITULO",
    "PAG_COMISSAO_POR_PARCELAS",
  ]

  const csvLines = [headers.join(";")]

  validRows.forEach((row) => {
    // Only include records where CONSIDERA_REPRESENTANTE is "SIM"
    if (row["CONSIDERA_REPRESENTANTE"] === "SIM") {
      const representanteRow = [
        row["CODIGO"] || "", // CODIGO_REPRESENTANTE
        "1", // CODIGO_EMPRESA
        "1", // CODIGO_FILIAL
        "", // CATEGORIA_REPRESENTANTE (blank)
        "", // VALOR_MIN_PEDIDO (blank)
        "", // PERC_COMISSAO_PADRAO_PRODUTO (blank)
        "", // PERC_COMISSAO_PADRAO_SERVICO (blank)
        "", // PERC_COMISSAO_PAGO_FATURAMENTO (blank)
        "", // ENCARGOS_NA_BASE_COMISSAO (blank)
        "", // OUTRAS_DESPESAS_NA_BASE_COMISSAO (blank)
        "", // VLR_EMBALAGENS_NA_BASE_COMISSAO (blank)
        "", // SEGURO_NA_BASE_COMISSAO (blank)
        "", // FRETE_NA_BASE_COMISSAO (blank)
        "", // IPI_NA_BASE_COMISSAO (blank)
        "", // ICMS_NA_BASE_COMISSAO (blank)
        "", // ICMS_SUBS_NA_BASE_COMISSAO (blank)
        "", // INSS_NA_BASE_COMISSAO (blank)
        "", // ISS_NA_BASE_COMISSAO (blank)
        "", // COFINS_FAT_NA_BASE_COMISSAO (blank)
        "", // COFINS_RET_NA_BASE_COMISSAO (blank)
        "", // PIS_FAT_NA_BASE_COMISSAO (blank)
        "", // PIS_RET_NA_BASE_COMISSAO (blank)
        "", // IRRF_NA_BASE_COMISSAO (blank)
        "", // CSLL_NA_BASE_COMISSAO (blank)
        "", // CODIGO_TABELA_PRECO_PADRAO (blank)
        "", // PERC_COMISSAO_PAGO_REC_TITULO (blank)
        "", // PAG_COMISSAO_POR_PARCELAS (blank)
      ]
      csvLines.push(representanteRow.join(";"))
    }
  })

  return csvLines.join("\n")
}

const validateUnitOfMeasure = (value: string): string => {
  if (!value || value.trim() === "") return ""

  const normalizedValue = value.toLowerCase().trim()

  if (["unidade", "unid"].includes(normalizedValue)) return "UNID"
  if (["peça", "pç", "pc", "peca", "peça", "peca", "não", "nao", "no", "n"].includes(normalizedValue)) return "PC"
  if (["metro", "m"].includes(normalizedValue)) return "M"
  if (["caixa", "cx"].includes(normalizedValue)) return "CX"
  if (["conjunto", "conjunta", "cj"].includes(normalizedValue)) return "CJ"
  if (["quilograma", "quilo", "kg"].includes(normalizedValue)) return "KG"

  return value // Return original if no match
}

const isValidFirstLevel = (classification: string): boolean => {
  if (!classification) return false
  const firstLevel = classification.split(".")[0]
  return firstLevel.length === 1 && /^[1-9]$/.test(firstLevel)
}

export const validateSpreadsheet = async (
  csvContent: string,
  subject: string,
  erpContext?: ERPValidationContext,
): Promise<ValidationResult> => {
  const template = templates[subject]
  if (!template) {
    throw new Error(`Template não encontrado para o assunto: ${subject}`)
  }

  const cleanedContent = csvContent
    .replace(/NÃƒO/g, "NAO")
    .replace(/NÃ£o/g, "NAO")
    .replace(/SÃ­m/g, "SIM")
    .replace(/Ã§/g, "ç")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã /g, "à")
    .replace(/Ã¢/g, "â")
    .replace(/Ãª/g, "ê")
    .replace(/Ã´/g, "ô")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã§/g, "ç")

  const separator = detectSeparator(cleanedContent)
  const lines = cleanedContent.trim().split("\n")

  const headers = parseCSVLine(lines[0], separator).map((h) => h.replace(/^"|"$/g, ""))

  // Validate headers
  const missingHeaders = template.headers.filter((h) => !headers.includes(h))
  const foundHeaders = template.headers.filter((h) => headers.includes(h))

  if (foundHeaders.length < template.headers.length * 0.5) {
    throw new Error(`Cabeçalhos obrigatórios faltando: ${missingHeaders.join(", ")}`)
  }

  const rows = lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = parseCSVLine(line, separator).map((v) => v.replace(/^"|"$/g, ""))
      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ""
      })
      return row
    })

  const validRows: Record<string, string>[] = []
  const correctionDetails: CorrectionDetail[] = []
  const excludedDetails: ExcludedDetail[] = []
  const processedDetails: ProcessedDetail[] = []

  const usedCodes = new Set<string>()
  const usedCnpjCpf = new Set<string>()
  const seenProductCodes = new Set<string>()
  const seenTituloCodes = new Set<string>()
  const seenPersonCodes = new Set<string>()

  const duplicatePlanCodes = new Set<string>()
  const seenPlanCodes = new Set<string>()
  const processedCodes = new Set<string>() // Track codes we've already processed during correction

  rows.forEach((row) => {
    if ((subject === "plano_financeiro" || subject === "plano_contabil") && row.codigoconta) {
      if (seenPlanCodes.has(row.codigoconta)) {
        duplicatePlanCodes.add(row.codigoconta)
      } else {
        seenPlanCodes.add(row.codigoconta)
        usedCodes.add(row.codigoconta)
      }
    }
    if (subject === "centro_custo" && row.codigodocentrodecusto) {
      if (seenPlanCodes.has(row.codigodocentrodecusto)) {
        duplicatePlanCodes.add(row.codigodocentrodecusto)
      } else {
        seenPlanCodes.add(row.codigodocentrodecusto)
        usedCodes.add(row.codigodocentrodecusto)
      }
    }
  })

  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 2

    if (subject === "produtos" && erpContext?.isConnected) {
      const codigo = row["Código"]
      const codigoFamilia = row["Código da família"]
      const codigoEmpresa = row["Código da empresa"]

      if (codigo && codigoFamilia && codigoEmpresa) {
        try {
          console.log(`[v0] Validando código ${codigo} para família ${codigoFamilia} e empresa ${codigoEmpresa}`)

          const produtoInfo = await consultarProdutoNoERP(
            codigoFamilia,
            codigoEmpresa,
            erpContext.token,
            erpContext.clientId,
          )

          if (produtoInfo.exists && produtoInfo.posPro) {
            const validation = validateCodigoWithFamilia(
              codigo,
              codigoFamilia,
              codigoEmpresa,
              produtoInfo.posPro,
              produtoInfo.codEmp,
            )

            if (!validation.isValid) {
              console.log(`[v0] Código ${codigo} inválido: ${validation.reason}`)
              excludedDetails.push({
                line: lineNumber,
                reason: validation.reason || "Código inválido para a família",
              })
              continue // Skip this row - excluir linha
            } else {
              console.log(
                `[v0] Código ${codigo} válido para família ${codigoFamilia} (${codigo.length} caracteres, máximo: ${produtoInfo.posPro})`,
              )
            }
          } else {
            console.log(`[v0] Família ${codigoFamilia} não encontrada no ERP para empresa ${codigoEmpresa}`)
            excludedDetails.push({
              line: lineNumber,
              reason: `Família ${codigoFamilia} não encontrada no ERP para empresa ${codigoEmpresa}`,
            })
            continue
          }
        } catch (error) {
          console.error(`[v0] Erro ao validar código ${codigo}:`, error)
          console.log(`[v0] Erro na validação, excluindo produto ${codigo} por segurança`)
          excludedDetails.push({
            line: lineNumber,
            reason: `Erro na validação do código ${codigo} - produto excluído por segurança`,
          })
          continue
        }
      }
    }

    // Updated PESSOA validation to exclude duplicates and empty codes
    if (subject === "pessoas") {
      if (!row.CODIGO || row.CODIGO.trim() === "") {
        excludedDetails.push({
          line: lineNumber,
          reason: "Código não preenchido - registro excluído",
        })
        continue
      }

      if (seenPersonCodes.has(row.CODIGO)) {
        excludedDetails.push({
          line: lineNumber,
          reason: `Código duplicado: ${row.CODIGO} - mantido apenas o primeiro registro`,
        })
        continue
      }

      if (row.CNPJ_CPF && row.CNPJ_CPF.trim() !== "") {
        const cleanCnpjCpf = row.CNPJ_CPF.replace(/\D/g, "")
        if (usedCnpjCpf.has(cleanCnpjCpf)) {
          excludedDetails.push({
            line: lineNumber,
            reason: "CNPJ/CPF duplicado - registro excluído",
          })
          continue
        }
        usedCnpjCpf.add(cleanCnpjCpf)
      }

      seenPersonCodes.add(row.CODIGO)
    }

    if (subject === "plano_financeiro" || subject === "plano_contabil") {
      if (!row.classificacao || row.classificacao.trim() === "" || row.classificacao.trim() === ".") {
        excludedDetails.push({
          line: lineNumber,
          reason: "Classificação não preenchida",
        })
        continue
      }

      const classification = row.classificacao || ""

      if (classification.includes(".")) {
        const firstLevel = classification.split(".")[0]
        if (firstLevel.length > 1 || !/^[1-9]$/.test(firstLevel)) {
          excludedDetails.push({
            line: lineNumber,
            reason: `Primeiro nível da classificação inválido: "${firstLevel}" - deve ser apenas um dígito (1-9)`,
          })
          continue
        }
      }

      // Check if classification is a single digit (level 1)
      if (/^[1-9]$/.test(classification.trim())) {
        excludedDetails.push({
          line: lineNumber,
          reason: `Conta nível 1 (${classification}) excluída - já cadastrada no ERP`,
        })
        continue
      }
    }

    // Handle product duplicates
    if (subject === "produtos" && row["Código"]) {
      if (seenProductCodes.has(row["Código"])) {
        excludedDetails.push({
          line: lineNumber,
          reason: `Código duplicado: ${row["Código"]} - mantido apenas o primeiro registro`,
        })
        continue
      }
      seenProductCodes.add(row["Código"])
    }

    // Handle titulo duplicates
    if ((subject === "titulos_receber" || subject === "titulos_pagar") && row.NUMERO_TITULO) {
      if (seenTituloCodes.has(row.NUMERO_TITULO)) {
        excludedDetails.push({
          line: lineNumber,
          reason: `Número de título duplicado: ${row.NUMERO_TITULO} - mantido apenas o primeiro registro`,
        })
        continue
      }
      seenTituloCodes.add(row.NUMERO_TITULO)
    }

    // Check required fields
    const missingRequired = template.requiredFields.filter((field) => !row[field] || row[field].trim() === "")
    if (missingRequired.length > 0) {
      excludedDetails.push({
        line: lineNumber,
        reason: `Campos obrigatórios faltando: ${missingRequired.join(", ")}`,
      })
      continue
    }

    const correctedRow: Record<string, string> = { ...row }
    let rowCorrected = false

    if (subject === "plano_financeiro" || subject === "plano_contabil") {
      if (
        !correctedRow.codigoconta ||
        (duplicatePlanCodes.has(correctedRow.codigoconta) && processedCodes.has(correctedRow.codigoconta))
      ) {
        const nextCode = getNextAvailableCode(usedCodes, 10)
        const original = correctedRow.codigoconta || ""
        correctedRow.codigoconta = nextCode
        usedCodes.add(nextCode)
        correctionDetails.push({
          line: lineNumber,
          field: "codigoconta",
          original: original,
          corrected: nextCode,
          reason: original
            ? "código duplicado substituído por próximo disponível"
            : "preenchimento automático de código faltante",
        })
        rowCorrected = true
      } else if (correctedRow.codigoconta) {
        // Mark this code as processed (first occurrence)
        processedCodes.add(correctedRow.codigoconta)
      }
    }

    if (subject === "centro_custo") {
      if (
        !correctedRow.codigodocentrodecusto ||
        (duplicatePlanCodes.has(correctedRow.codigodocentrodecusto) &&
          processedCodes.has(correctedRow.codigodocentrodecusto))
      ) {
        const nextCode = getNextAvailableCode(usedCodes, 10)
        const original = correctedRow.codigodocentrodecusto || ""
        correctedRow.codigodocentrodecusto = nextCode
        usedCodes.add(nextCode)
        correctionDetails.push({
          line: lineNumber,
          field: "codigodocentrodecusto",
          original: original,
          corrected: nextCode,
          reason: original
            ? "código duplicado substituído por próximo disponível"
            : "preenchimento automático de código faltante",
        })
        rowCorrected = true
      } else if (correctedRow.codigodocentrodecusto) {
        // Mark this code as processed (first occurrence)
        processedCodes.add(correctedRow.codigodocentrodecusto)
      }
    }

    // Apply field validations
    Object.entries(template.validations).forEach(([field, validator]) => {
      if (correctedRow[field] !== undefined) {
        const originalValue = correctedRow[field] || ""
        const correctedValue = validator(originalValue, correctedRow, rows)

        if (correctedValue !== originalValue) {
          correctedRow[field] = correctedValue
          rowCorrected = true
          correctionDetails.push({
            line: lineNumber,
            field,
            original: originalValue,
            corrected: correctedValue,
            reason: "padronização",
          })
        }
      }
    })

    if (subject === "produtos") {
      // Validate unit of measure fields
      const unitFields = [
        "Código da unidade de medida de estoque",
        "Código da unidade de medida de venda",
        "Código da unidade de medida auxiliar de estoque",
      ]

      unitFields.forEach((field) => {
        if (row[field]) {
          const originalValue = row[field]
          const correctedValue = validateUnitOfMeasure(originalValue)
          if (originalValue !== correctedValue) {
            correctedRow[field] = correctedValue
            correctionDetails.push({
              line: lineNumber,
              field,
              original: originalValue,
              corrected: correctedValue,
              reason: "padronização de unidade de medida",
            })
            rowCorrected = true
          }
        }
      })
    }

    validRows.push(correctedRow)
    processedDetails.push({ line: lineNumber, data: correctedRow })
  }

  const correctedCsvLines = [
    template.headers.join(separator),
    ...validRows.map((row) =>
      template.headers
        .map((header) => {
          const value = row[header] || ""
          // Quote fields that contain the separator
          if (value.includes(separator)) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        })
        .join(separator),
    ),
  ]
  const correctedCsv = correctedCsvLines.join("\n")

  let optionalDownloads:
    | {
        situacaoNCM?: string
        complementarProduto?: string
        clienteEspecializacao?: string
        representanteComercial?: string
      }
    | undefined

  if (subject === "produtos") {
    optionalDownloads = {
      situacaoNCM: generateSituacaoNCM(validRows),
      complementarProduto: generateComplementarProduto(validRows),
    }
  } else if (subject === "pessoas") {
    optionalDownloads = {
      clienteEspecializacao: generateClienteEspecializacao(validRows),
      representanteComercial: generateRepresentanteComercial(validRows),
    }
  }

  return {
    isValid: excludedDetails.length === 0,
    totalRecords: rows.length,
    processedRecords: validRows.length,
    corrections: correctionDetails.length,
    excludedRecords: excludedDetails.length,
    correctionDetails,
    excludedDetails,
    correctedCsv,
    processedDetails,
    ...optionalDownloads,
  }
}

export const downloadTemplate = (subject: string): void => {
  const template = templates[subject]
  if (!template) return

  const sampleData: Record<string, string> = {}

  // Add sample data based on subject
  if (subject === "pessoas") {
    sampleData.CODIGO = "1"
    sampleData.NOME = "João Silva"
    sampleData.FANTASIA = "João Silva ME"
    sampleData.TIPO_PESSOA = "FISICA"
    sampleData.CNPJ_CPF = "12345678901"
    sampleData.TIPO_MERCADO = "INTERNO"
    sampleData.SITUACAO = "ATIVO"
  } else if (subject === "produtos") {
    sampleData["Código"] = "PROD001"
    sampleData["Descrição"] = "Produto Exemplo"
    sampleData["Código da empresa"] = "1"
    sampleData["Código da família"] = "1"
    sampleData["Código da unidade de medida de estoque"] = "UNID"
    sampleData["Depósito - Código da filial"] = "1"
  }

  const csvContent = [
    template.headers.join(";"),
    template.headers.map((header) => sampleData[header] || "").join(";"),
  ].join("\n")

  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = `modelo_${subject}.csv`
  link.click()
}
