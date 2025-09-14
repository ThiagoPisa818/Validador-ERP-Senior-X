"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import {
  Download,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react"
import { validateSpreadsheet, downloadTemplate, type ValidationResult } from "@/lib/validator"

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

      const result = await validateSpreadsheet(csvContent, selectedType)
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

  const handleDownloadCorrectedExcel = async () => {
    if (!validationResult) return

    try {
      // Load SheetJS library dynamically
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs")

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
            {/* Selection and Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Download className="w-5 h-5 text-emerald-600" />
                  <span>Selecionar Planilha e Processar</span>
                </CardTitle>
                <CardDescription>
                  Selecione o assunto e faça upload do arquivo CSV ou Excel para validação automática
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
                        <XCircle className="w-4 h-4 mr-2" />
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
                              <div className="max-h-40 overflow-y-auto space-y-2">
                                {paginatedExcluded.map((detail, index) => (
                                  <Alert key={startIndex + index} className="border-red-200 bg-red-50">
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                    <AlertDescription className="text-red-800">
                                      <strong>Linha {detail.line}:</strong> {detail.reason}
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

                  {/* Download Buttons */}
                  <div className="space-y-3">
                    {/* Main Download Buttons */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Button
                        onClick={handleDownloadCorrected}
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        size="lg"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        CSV UTF-8
                      </Button>

                      <Button
                        onClick={handleDownloadCorrectedWithBOM}
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        size="lg"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        UTF-8 sem BOM
                      </Button>

                      {/* Excel download option */}
                      <Button
                        onClick={handleDownloadCorrectedExcel}
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        size="lg"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Excel (.xlsx)
                      </Button>
                    </div>

                    {((selectedType === "produtos" &&
                      (validationResult.situacaoNCM || validationResult.complementarProduto)) ||
                      (selectedType === "pessoas" && validationResult.clienteEspecializacao)) && (
                      <div className="space-y-2">
                        <Separator />
                        <h4 className="font-semibold text-gray-700 text-sm">Downloads Opcionais:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {selectedType === "produtos" && validationResult.situacaoNCM && (
                            <Button
                              onClick={handleDownloadSituacaoNCM}
                              variant="outline"
                              size="sm"
                              className="w-full bg-transparent"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Situação NCM
                            </Button>
                          )}
                          {selectedType === "produtos" && validationResult.complementarProduto && (
                            <Button
                              onClick={handleDownloadComplementarProduto}
                              variant="outline"
                              size="sm"
                              className="w-full bg-transparent"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Complementar Produto
                            </Button>
                          )}
                          {selectedType === "pessoas" && validationResult.clienteEspecializacao && (
                            <Button
                              onClick={handleDownloadClienteEspecializacao}
                              variant="outline"
                              size="sm"
                              className="w-full bg-transparent"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Cliente Especialização
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
            {/* Automatic Corrections Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-emerald-700">Correções Automáticas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Validação de cabeçalhos por assunto</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Padronização SIM/NÃO e ATIVO/INATIVO</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Formatação CPF/CNPJ com zeros à esquerda</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Correção de unidades de medida</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Validação de valores numéricos e decimais</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Exclusão de registros com campos obrigatórios vazios</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Correção automática de tipos de pessoa e mercado</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Padronização de regimes tributários</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Formatação de datas e valores monetários</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Correção de códigos NCM e classificações</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Eliminação de duplicidades por chave primária</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Preenchimento de campos com valores padrão</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Validação de limites de caracteres por campo</span>
                </div>
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">Correção de separadores de email e formatação</span>
                </div>
              </CardContent>
            </Card>

            {/* Current Selection Info */}
            {selectedType && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-emerald-700">{selectedTypeData?.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 mb-4">
                    O sistema aplicará automaticamente todas as regras de validação e correção específicas para este
                    tipo de planilha, incluindo validação de cabeçalhos.
                  </p>
                  <Badge variant="default" className="bg-emerald-100 text-emerald-800">
                    Modelo disponível para download
                  </Badge>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
