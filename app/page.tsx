"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import {
  Download,
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  RotateCcw,
  Info,
  HelpCircle,
} from "lucide-react"
import { validateSpreadsheet, downloadTemplate, type ValidationResult } from "@/lib/validator"
import { ERPLogin } from "@/components/erp-login"
import type { ERPValidationContext } from "@/lib/erp-validator"

const SPREADSHEET_TYPES = [
  { value: "pessoas", label: "👥 Pessoas", displayName: "PESSOAS" },
  { value: "produtos", label: "📦 Produtos", displayName: "PRODUTOS" },
  { value: "plano_financeiro", label: "💰 Plano Financeiro", displayName: "PLANO_FINANCEIRO" },
  { value: "plano_contabil", label: "📊 Plano Contábil", displayName: "PLANO_CONTABIL" },
  { value: "centro_custo", label: "🏢 Centro de Custo", displayName: "CENTRO_CUSTO" },
  { value: "titulos_receber", label: "💳 Títulos a Receber", displayName: "TITULOS_RECEBER" },
  { value: "titulos_pagar", label: "💸 Títulos a Pagar", displayName: "TITULOS_PAGAR" },
  { value: "tabela_preco_venda", label: "💲 Tabela Preço Venda", displayName: "TABELA_PRECO_VENDA" },
  { value: "tabela_preco_compra", label: "🛒 Tabela Preço Compra", displayName: "TABELA_PRECO_COMPRA" },
  { value: "saldo_inicial_estoque", label: "📋 Saldo Inicial Estoque", displayName: "SALDO_INICIAL_ESTOQUE" },
]

export default function ValidadorERPSeniorX() {
  const [selectedType, setSelectedType] = useState<string>("")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [showCorrections, setShowCorrections] = useState(false)
  const [showProcessed, setShowProcessed] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [correctionPage, setCorrectionPage] = useState(1)
  const [excludedPage, setExcludedPage] = useState(1)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [erpContext, setErpContext] = useState<ERPValidationContext>({
    token: "",
    isConnected: false,
  })

  const ITEMS_PER_PAGE = 50

  const handleTypeChange = (value: string) => {
    setSelectedType(value)
    setUploadedFile(null)
    setValidationResult(null)
    setShowCorrections(false)
    setShowProcessed(false)
    setShowExcluded(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleClear = () => {
    setUploadedFile(null)
    setValidationResult(null)
    setShowCorrections(false)
    setShowProcessed(false)
    setShowExcluded(false)
    setCorrectionPage(1)
    setExcludedPage(1)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleERPConnectionChange = (isConnected: boolean, token?: string, clientId?: string) => {
    setErpContext({
      isConnected,
      token: token || "",
      clientId: clientId || "",
    })
    console.log("[v0] Estado ERP atualizado:", { isConnected, hasToken: !!token, hasClientId: !!clientId })
  }

  const handleFileUpload = (file: File) => {
    if (!selectedType) {
      alert("Por favor, selecione o assunto da planilha primeiro.")
      return
    }

    const allowedExtensions = [".csv", ".xlsx", ".xls"]
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."))

    if (!allowedExtensions.includes(fileExtension)) {
      alert("Por favor, selecione apenas arquivos CSV ou Excel (.csv, .xlsx, .xls).")
      return
    }

    setUploadedFile(file)
    setValidationResult(null)
    setShowCorrections(false)
    setShowProcessed(false)
    setShowExcluded(false)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  const handleValidate = async () => {
    if (!uploadedFile || !selectedType) return

    setIsValidating(true)
    try {
      // Read file content as text
      const csvContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()

        // First try UTF-8
        reader.onload = (e) => {
          const result = e.target?.result
          if (typeof result === "string") {
            // Check if the content looks like it has encoding issues
            const hasEncodingIssues =
              result.includes("") ||
              /[\u00C0-\u00FF]{2,}/.test(result) || // Multiple accented chars in sequence
              result.includes("Ã§") ||
              result.includes("Ã£") ||
              result.includes("Ã©")

            if (hasEncodingIssues) {
              // Try reading with Windows-1252 (ANSI)
              const reader2 = new FileReader()
              reader2.onload = (e2) => {
                const result2 = e2.target?.result
                if (typeof result2 === "string") {
                  resolve(result2)
                } else {
                  resolve(result) // Fallback to original
                }
              }
              reader2.onerror = () => resolve(result) // Fallback to original
              reader2.readAsText(uploadedFile, "windows-1252")
            } else {
              resolve(result)
            }
          } else {
            reject(new Error("Failed to read file as text"))
          }
        }

        reader.onerror = () => {
          // If UTF-8 fails, try ANSI
          const reader2 = new FileReader()
          reader2.onload = (e) => {
            const result = e.target?.result
            if (typeof result === "string") {
              resolve(result)
            } else {
              reject(new Error("Failed to read file as text"))
            }
          }
          reader2.onerror = () => reject(new Error("Error reading file"))
          reader2.readAsText(uploadedFile, "windows-1252")
        }

        reader.readAsText(uploadedFile, "utf-8")
      })

      const result = await validateSpreadsheet(csvContent, selectedType, erpContext)
      setValidationResult(result)
    } catch (error) {
      console.error("Erro na validação:", error)
      alert("Erro ao processar o arquivo. Verifique se o formato está correto.")
    } finally {
      setIsValidating(false)
    }
  }

  const handleDownloadTemplate = () => {
    if (!selectedType) {
      alert("Por favor, selecione o assunto da planilha primeiro.")
      return
    }
    downloadTemplate(selectedType)
  }

  const handleDownloadCorrected = () => {
    if (!validationResult) return

    const selectedTypeData = SPREADSHEET_TYPES.find((t) => t.value === selectedType)
    const filename = selectedTypeData?.displayName || selectedType

    const BOM = "\uFEFF"
    const csvWithBOM = BOM + validationResult.correctedCsv
    const blob = new Blob([csvWithBOM], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filename}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadCorrectedWithBOM = () => {
    if (!validationResult) return

    const selectedTypeData = SPREADSHEET_TYPES.find((t) => t.value === selectedType)
    const filename = selectedTypeData?.displayName || selectedType

    const csvWithoutBOM = validationResult.correctedCsv
    const blob = new Blob([csvWithoutBOM], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filename}_sem_BOM.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadSituacaoNCM = () => {
    if (!validationResult?.situacaoNCM) return

    const blob = new Blob([validationResult.situacaoNCM], { type: "text/csv;charset=utf-8-bom" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "SITUACAO_NCM.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadComplementarProduto = () => {
    if (!validationResult?.complementarProduto) return

    const blob = new Blob([validationResult.complementarProduto], {
      type: "text/csv;charset=utf-8-bom",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "COMPLEMENTAR_PRODUTO.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadClienteEspecializacao = () => {
    if (!validationResult?.clienteEspecializacao) return

    const blob = new Blob([validationResult.clienteEspecializacao], {
      type: "text/csv;charset=utf-8-bom",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "CLIENTE_ESPECIALIZACAO_COMERCIAL.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadRepresentanteComercial = () => {
    if (!validationResult?.representanteComercial) return

    const blob = new Blob([validationResult.representanteComercial], {
      type: "text/csv;charset=utf-8-bom",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "REPRESENTANTE_COMERCIAL.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadCorrectedExcel = async () => {
    if (!validationResult) return

    try {
      // Load SheetJS library dynamically
      const XLSX = await import("xlsx")

      const selectedTypeData = SPREADSHEET_TYPES.find((t) => t.value === selectedType)
      const filename = selectedTypeData?.displayName || selectedType

      // Parse CSV content to create Excel workbook
      const csvLines = validationResult.correctedCsv.split("\n")
      const data = csvLines
        .map((line) => {
          // Simple CSV parsing - split by comma and handle quoted fields
          const result = []
          let current = ""
          let inQuotes = false

          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === "," && !inQuotes) {
              result.push(current)
              current = ""
            } else {
              current += char
            }
          }
          result.push(current)
          return result
        })
        .filter((row) => row.some((cell) => cell.trim() !== ""))

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(data)

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Dados")

      // Generate Excel file and download
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${filename}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Erro ao gerar arquivo Excel:", error)
      alert("Erro ao gerar arquivo Excel. Tente novamente.")
    }
  }

  const handleDownloadCorrectedExcelFormatted = async () => {
    if (!validationResult) return

    try {
      // Load SheetJS library dynamically
      const XLSX = await import("xlsx")

      const selectedTypeData = SPREADSHEET_TYPES.find((t) => t.value === selectedType)
      const filename = selectedTypeData?.displayName || selectedType

      const csvLines = validationResult.correctedCsv.split("\n")
      const data = csvLines
        .map((line) => {
          // Handle both comma and semicolon separators
          const separator = line.includes(";") ? ";" : ","
          const result = []
          let current = ""
          let inQuotes = false

          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === separator && !inQuotes) {
              result.push(current.replace(/^"|"$/g, "")) // Remove surrounding quotes
              current = ""
            } else {
              current += char
            }
          }
          result.push(current.replace(/^"|"$/g, "")) // Remove surrounding quotes
          return result
        })
        .filter((row) => row.some((cell) => cell.trim() !== ""))

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(data)

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1")
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = XLSX.utils.encode_cell({ c: C, r: R })
          if (!ws[cell_address]) continue

          // Force text format to preserve leading zeros and prevent number formatting
          ws[cell_address].t = "s" // Set cell type to string
          if (ws[cell_address].v !== undefined) {
            ws[cell_address].v = String(ws[cell_address].v)
            // Preserve leading zeros by ensuring the value is treated as text
            ws[cell_address].z = "@" // Text format code
          }
        }
      }

      const colWidths = []
      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxWidth = 10
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cell_address = XLSX.utils.encode_cell({ c: C, r: R })
          if (ws[cell_address] && ws[cell_address].v) {
            const cellLength = String(ws[cell_address].v).length
            maxWidth = Math.max(maxWidth, Math.min(cellLength + 2, 50))
          }
        }
        colWidths.push({ wch: maxWidth })
      }
      ws["!cols"] = colWidths

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Dados")

      // Generate Excel file and download
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${filename}_formatado.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Erro ao gerar arquivo Excel formatado:", error)
      alert("Erro ao gerar arquivo Excel formatado. Tente novamente.")
    }
  }

  const selectedTypeData = SPREADSHEET_TYPES.find((t) => t.value === selectedType)

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* Header */}
      <header className="bg-white border-b border-emerald-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Validador ERP SeniorX</h1>
                <p className="text-sm text-gray-600">
                  Sistema de validação e correção automática para carga inicial ERP
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/#cadastros/ferramentas/importar-carga-inicial.htm"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Documentação
              </a>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <ERPLogin onConnectionChange={handleERPConnectionChange} />

            {/* Selection and Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Download className="w-5 h-5 text-emerald-600" />
                  <span>Selecionar Planilha e Processar</span>
                </CardTitle>
                <CardDescription>
                  Selecione o assunto e faça upload do arquivo CSV ou Excel para validação automática
                  {erpContext.isConnected && (
                    <span className="block mt-1 text-emerald-600 font-medium">✓ Validações via API ERP ativas</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Type Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Assunto da Planilha</label>
                    <Select value={selectedType} onValueChange={handleTypeChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o tipo de planilha" />
                      </SelectTrigger>
                      <SelectContent>
                        {SPREADSHEET_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <span>{type.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Download Template Button */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Modelo</label>
                    <Button
                      onClick={handleDownloadTemplate}
                      disabled={!selectedType}
                      variant="outline"
                      className="w-full bg-transparent"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Modelo da Planilha
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* File Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Arquivo CSV ou Excel</label>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      dragActive
                        ? "border-emerald-500 bg-emerald-50"
                        : uploadedFile
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-gray-300 hover:border-gray-400"
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    {uploadedFile ? (
                      <div className="space-y-2">
                        <FileText className="w-12 h-12 text-emerald-600 mx-auto" />
                        <div>
                          <p className="font-medium text-gray-900">{uploadedFile.name}</p>
                          <p className="text-sm text-gray-500">
                            {uploadedFile.size > 1024 * 1024
                              ? `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB`
                              : `${(uploadedFile.size / 1024).toFixed(1)} KB`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                        <div>
                          <p className="text-lg font-medium text-gray-900">Arraste seu arquivo aqui</p>
                          <p className="text-sm text-gray-500">Formatos aceitos: CSV, Excel (.xlsx, .xls)</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!selectedType}
                        >
                          Selecionar Arquivo
                        </Button>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={handleValidate}
                    disabled={!uploadedFile || !selectedType || isValidating}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    size="lg"
                  >
                    {isValidating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Validando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Validar e Ajustar Planilha
                      </>
                    )}
                  </Button>

                  {(uploadedFile || validationResult) && (
                    <Button onClick={handleClear} variant="outline" size="lg" className="px-6 bg-transparent">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Limpar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Validation Results */}
            {validationResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Resultado do Processamento</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Statistics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{validationResult.totalRecords}</div>
                      <div className="text-sm text-blue-700">Total de registros</div>
                    </div>
                    <div className="text-center p-4 bg-emerald-50 rounded-lg">
                      <div className="text-2xl font-bold text-emerald-600">{validationResult.processedRecords}</div>
                      <div className="text-sm text-emerald-700 mb-2">Registros processados</div>
                      {validationResult.processedRecords > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowProcessed(!showProcessed)}
                          className="text-xs"
                        >
                          {showProcessed ? (
                            <>
                              <EyeOff className="w-3 h-3 mr-1" />
                              Ocultar
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3 mr-1" />
                              Ver
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="text-center p-4 bg-amber-50 rounded-lg">
                      <div className="text-2xl font-bold text-amber-600">{validationResult.corrections}</div>
                      <div className="text-sm text-amber-700 mb-2">Correções realizadas</div>
                      {validationResult.correctionDetails && validationResult.correctionDetails.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowCorrections(!showCorrections)}
                          className="text-xs"
                        >
                          {showCorrections ? (
                            <>
                              <EyeOff className="w-3 h-3 mr-1" />
                              Ocultar
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3 mr-1" />
                              Ver
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{validationResult.excludedRecords}</div>
                      <div className="text-sm text-red-700 mb-2">Registros excluídos</div>
                      {validationResult.excludedDetails.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowExcluded(!showExcluded)}
                          className="text-xs"
                        >
                          {showExcluded ? (
                            <>
                              <EyeOff className="w-3 h-3 mr-1" />
                              Ocultar
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3 mr-1" />
                              Ver
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Processed Records Details */}
                  {showProcessed && validationResult.processedRecords > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-emerald-700 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Detalhes dos Registros Processados
                      </h4>
                      <Alert className="border-emerald-200 bg-emerald-50">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <AlertDescription className="text-emerald-800">
                          {validationResult.processedRecords} registros foram processados com sucesso e estão incluídos
                          no arquivo final.
                          {validationResult.corrections > 0 && (
                            <span className="block mt-1">
                              Destes, {validationResult.corrections} campos foram corrigidos automaticamente.
                            </span>
                          )}
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  {/* Correction Details */}
                  {showCorrections &&
                    validationResult.correctionDetails &&
                    validationResult.correctionDetails.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-amber-700 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Detalhes das Correções Realizadas
                        </h4>
                        <div className="space-y-2">
                          {(() => {
                            const startIndex = (correctionPage - 1) * ITEMS_PER_PAGE
                            const endIndex = startIndex + ITEMS_PER_PAGE
                            const paginatedCorrections = validationResult.correctionDetails.slice(startIndex, endIndex)
                            const totalPages = Math.ceil(validationResult.correctionDetails.length / ITEMS_PER_PAGE)

                            return (
                              <>
                                <div className="max-h-60 overflow-y-auto space-y-2">
                                  {paginatedCorrections.map((detail, index) => (
                                    <Alert key={startIndex + index} className="border-amber-200 bg-amber-50">
                                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                                      <AlertDescription className="text-amber-800">
                                        <div className="space-y-1">
                                          <div className="font-medium">
                                            Linha {detail.line}, Coluna {detail.field}
                                          </div>
                                          <div className="text-sm">
                                            <span className="font-mono bg-red-100 px-1 rounded">{detail.original}</span>
                                            {" → "}
                                            <span className="font-mono bg-green-100 px-1 rounded">
                                              {detail.corrected}
                                            </span>
                                          </div>
                                          {detail.reason && (
                                            <div className="text-xs text-amber-700 mt-1">
                                              Valor alterado de "{detail.original}" para "{detail.corrected}" para{" "}
                                              {detail.reason}
                                            </div>
                                          )}
                                        </div>
                                      </AlertDescription>
                                    </Alert>
                                  ))}
                                </div>
                                {totalPages > 1 && (
                                  <div className="flex items-center justify-between pt-2">
                                    <div className="text-sm text-gray-600">
                                      Página {correctionPage} de {totalPages} (
                                      {validationResult.correctionDetails.length} correções)
                                    </div>
                                    <div className="flex space-x-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCorrectionPage(Math.max(1, correctionPage - 1))}
                                        disabled={correctionPage === 1}
                                      >
                                        Anterior
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCorrectionPage(Math.min(totalPages, correctionPage + 1))}
                                        disabled={correctionPage === totalPages}
                                      >
                                        Próxima
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    )}

                  {/* Excluded Records Details */}
                  {showExcluded && validationResult.excludedDetails.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-red-700 flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Detalhes dos Registros Excluídos
                      </h4>
                      <div className="space-y-2">
                        {(() => {
                          const startIndex = (excludedPage - 1) * ITEMS_PER_PAGE
                          const endIndex = startIndex + ITEMS_PER_PAGE
                          const paginatedExcluded = validationResult.excludedDetails.slice(startIndex, endIndex)
                          const totalPages = Math.ceil(validationResult.excludedDetails.length / ITEMS_PER_PAGE)

                          return (
                            <>
                              <div className="max-h-60 overflow-y-auto space-y-2">
                                {paginatedExcluded.map((detail, index) => (
                                  <Alert key={startIndex + index} className="border-red-200 bg-red-50">
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                    <AlertDescription className="text-red-800">
                                      <div className="space-y-1">
                                        <div className="font-medium">Linha {detail.line}</div>
                                        <div className="text-sm">{detail.reason}</div>
                                        {detail.field && (
                                          <div className="text-xs text-red-700 mt-1">
                                            Campo problemático: {detail.field}
                                            {detail.original && ` - Valor: "${detail.original}"`}
                                          </div>
                                        )}
                                      </div>
                                    </AlertDescription>
                                  </Alert>
                                ))}
                              </div>
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-2">
                                  <div className="text-sm text-gray-600">
                                    Página {excludedPage} de {totalPages} ({validationResult.excludedDetails.length}{" "}
                                    exclusões)
                                  </div>
                                  <div className="flex space-x-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setExcludedPage(Math.max(1, excludedPage - 1))}
                                      disabled={excludedPage === 1}
                                    >
                                      Anterior
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setExcludedPage(Math.min(totalPages, excludedPage + 1))}
                                      disabled={excludedPage === totalPages}
                                    >
                                      Próxima
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Download Section */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 flex items-center">
                      <Download className="w-4 h-4 mr-2" />
                      Downloads Disponíveis
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Main File Downloads */}
                      <Button onClick={handleDownloadCorrected} className="bg-emerald-600 hover:bg-emerald-700">
                        <Download className="w-4 h-4 mr-2" />
                        CSV Corrigido (com BOM)
                      </Button>

                      <Button onClick={handleDownloadCorrectedWithBOM} variant="outline" className="bg-transparent">
                        <Download className="w-4 h-4 mr-2" />
                        CSV Corrigido (sem BOM)
                      </Button>

                      <Button onClick={handleDownloadCorrectedExcel} variant="outline" className="bg-transparent">
                        <Download className="w-4 h-4 mr-2" />
                        Excel Simples
                      </Button>

                      <Button
                        onClick={handleDownloadCorrectedExcelFormatted}
                        variant="outline"
                        className="bg-transparent"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Excel Formatado
                      </Button>
                    </div>

                    {/* Additional Files */}
                    {(validationResult.situacaoNCM ||
                      validationResult.complementarProduto ||
                      validationResult.clienteEspecializacao ||
                      validationResult.representanteComercial) && (
                      <div className="space-y-3">
                        <h5 className="font-medium text-gray-800">Arquivos Complementares:</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {validationResult.situacaoNCM && (
                            <Button
                              onClick={handleDownloadSituacaoNCM}
                              variant="outline"
                              size="sm"
                              className="bg-transparent"
                            >
                              <Download className="w-3 h-3 mr-2" />
                              SITUACAO_NCM.csv
                            </Button>
                          )}

                          {validationResult.complementarProduto && (
                            <Button
                              onClick={handleDownloadComplementarProduto}
                              variant="outline"
                              size="sm"
                              className="bg-transparent"
                            >
                              <Download className="w-3 h-3 mr-2" />
                              COMPLEMENTAR_PRODUTO.csv
                            </Button>
                          )}

                          {validationResult.clienteEspecializacao && (
                            <Button
                              onClick={handleDownloadClienteEspecializacao}
                              variant="outline"
                              size="sm"
                              className="bg-transparent"
                            >
                              <Download className="w-3 h-3 mr-2" />
                              CLIENTE_ESPECIALIZACAO.csv
                            </Button>
                          )}

                          {validationResult.representanteComercial && (
                            <Button
                              onClick={handleDownloadRepresentanteComercial}
                              variant="outline"
                              size="sm"
                              className="bg-transparent"
                            >
                              <Download className="w-3 h-3 mr-2" />
                              REPRESENTANTE_COMERCIAL.csv
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Info className="w-5 h-5 text-blue-600" />
                  <span>Como Usar</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-start space-x-2">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <p className="font-medium">Selecione o Assunto</p>
                      <p className="text-gray-600">Escolha o tipo de planilha que você quer validar</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <p className="font-medium">Baixe o Modelo</p>
                      <p className="text-gray-600">Use o modelo oficial para garantir a estrutura correta</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Faça Upload</p>
                      <p className="text-gray-600">Arraste ou selecione seu arquivo CSV/Excel</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      4
                    </div>
                    <div>
                      <p className="font-medium">Valide e Baixe</p>
                      <p className="text-gray-600">O sistema corrige automaticamente e gera o arquivo final</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Validation Summary */}
            {validationResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Resumo da Validação</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Planilha:</span>
                      <span className="font-medium">{selectedTypeData?.label}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-600">Total de registros:</span>
                      <span className="font-medium">{validationResult.totalRecords}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-600">Processados:</span>
                      <span className="font-medium text-emerald-600">{validationResult.processedRecords}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-600">Corrigidos:</span>
                      <span className="font-medium text-amber-600">{validationResult.corrections}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-600">Excluídos:</span>
                      <span className="font-medium text-red-600">{validationResult.excludedRecords}</span>
                    </div>

                    <Separator />

                    <div className="flex justify-between">
                      <span className="text-gray-600">Taxa de sucesso:</span>
                      <span className="font-medium text-emerald-600">
                        {((validationResult.processedRecords / validationResult.totalRecords) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <HelpCircle className="w-5 h-5 text-amber-600" />
                  <span>Dicas Importantes</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="font-medium text-amber-800">📋 Formato dos Arquivos</p>
                    <p className="text-amber-700 mt-1">
                      Use sempre os modelos oficiais. Eles garantem que todas as colunas obrigatórias estejam presentes.
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-medium text-blue-800">🔍 Validações Automáticas</p>
                    <p className="text-blue-700 mt-1">
                      O sistema corrige automaticamente formatos de data, CPF/CNPJ, códigos e outros campos
                      padronizados.
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="font-medium text-emerald-800">🔗 Conexão ERP</p>
                    <p className="text-emerald-700 mt-1">
                      Conecte-se ao ERP para validações avançadas como verificação de códigos existentes e
                      relacionamentos.
                    </p>
                  </div>

                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="font-medium text-red-800">⚠️ Registros Excluídos</p>
                    <p className="text-red-700 mt-1">
                      Registros com erros críticos são excluídos. Verifique os detalhes para corrigir manualmente se
                      necessário.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
