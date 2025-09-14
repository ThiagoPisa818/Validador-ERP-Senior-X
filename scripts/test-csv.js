// Script para testar o arquivo CSV fornecido
const csvUrl = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/pessoa1-83s1TycHhTUHCJk7aTfv3gGxVtNfA5.csv"

async function testCsvFile() {
  try {
    console.log("Fazendo download do arquivo CSV...")
    const response = await fetch(csvUrl)
    const text = await response.text()

    console.log("Conteúdo do arquivo:")
    console.log("=".repeat(50))
    console.log(text)
    console.log("=".repeat(50))

    const lines = text.split("\n").filter((line) => line.trim())
    console.log(`\nTotal de linhas: ${lines.length}`)

    if (lines.length > 0) {
      const firstLine = lines[0]
      console.log(`\nPrimeira linha (cabeçalho): ${firstLine}`)

      // Detectar separador
      const semicolonCount = (firstLine.match(/;/g) || []).length
      const commaCount = (firstLine.match(/,/g) || []).length
      const separator = semicolonCount > commaCount ? ";" : ","

      console.log(`\nSeparador detectado: "${separator}"`)
      console.log(`Ponto e vírgula: ${semicolonCount}, Vírgulas: ${commaCount}`)

      // Parse headers
      const headers = firstLine.split(separator).map((h) => h.trim().replace(/^["']|["']$/g, ""))
      console.log(`\nCabeçalhos encontrados (${headers.length}):`)
      headers.forEach((header, index) => {
        console.log(`${index + 1}. "${header}"`)
      })

      // Cabeçalhos esperados para pessoas
      const expectedHeaders = [
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
      ]

      console.log(`\nCabeçalhos esperados (${expectedHeaders.length}):`)
      expectedHeaders.forEach((header, index) => {
        const found = headers.includes(header)
        console.log(`${index + 1}. "${header}" ${found ? "✓" : "✗"}`)
      })

      const foundHeaders = expectedHeaders.filter((h) => headers.includes(h))
      const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h))

      console.log(`\nResumo:`)
      console.log(`Cabeçalhos encontrados: ${foundHeaders.length}/${expectedHeaders.length}`)
      console.log(`Cabeçalhos faltando: ${missingHeaders.length}`)

      if (missingHeaders.length > 0) {
        console.log(`\nCabeçalhos faltando:`)
        missingHeaders.forEach((header) => console.log(`- ${header}`))
      }

      // Mostrar algumas linhas de dados
      if (lines.length > 1) {
        console.log(`\nPrimeiras linhas de dados:`)
        for (let i = 1; i < Math.min(4, lines.length); i++) {
          console.log(`Linha ${i + 1}: ${lines[i]}`)
        }
      }
    }
  } catch (error) {
    console.error("Erro ao processar arquivo:", error)
  }
}

testCsvFile()
