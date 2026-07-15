# ============================================================
#  GymFit ERP Write-back API - PowerShell Test Suite
#  Run from erp_api\ with: .\test_api.ps1
# ============================================================

$BASE = "http://localhost:8000"
$pass = 0
$fail = 0

# Unique suffix so repeated runs don't hit duplicate AccountName/CardID
$RUN = (Get-Date -Format "yyMMddHHmmss")

function Write-Section($title) {
    Write-Host ""
    Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
}

function Invoke-Test {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Body = $null,
        [int]$ExpectStatus = 200,
        [string[]]$ExpectKeys = @()
    )

    $bodyJson = if ($Body) { $Body | ConvertTo-Json -Depth 5 } else { $null }

    try {
        $params = @{
            Uri             = $Url
            Method          = $Method
            ContentType     = "application/json"
            UseBasicParsing = $true
        }
        if ($bodyJson) { $params.Body = $bodyJson }

        $response = Invoke-WebRequest @params -ErrorAction Stop
        $status   = $response.StatusCode
        $json     = $response.Content | ConvertFrom-Json

        $ok = ($status -eq $ExpectStatus)

        $missingKeys = @()
        foreach ($key in $ExpectKeys) {
            if ($null -eq $json.$key) { $missingKeys += $key }
        }
        if ($missingKeys.Count -gt 0) { $ok = $false }

        if ($ok) {
            Write-Host "  [PASS] $Name" -ForegroundColor Green
            Write-Host "         Status : $status" -ForegroundColor DarkGreen
            Write-Host "         Body   : $($response.Content)" -ForegroundColor DarkGreen
            $script:pass++
        } else {
            Write-Host "  [FAIL] $Name" -ForegroundColor Red
            Write-Host "         Status   : $status  (expected $ExpectStatus)" -ForegroundColor DarkRed
            if ($missingKeys) {
                Write-Host "         Missing  : $($missingKeys -join ', ')" -ForegroundColor DarkRed
            }
            Write-Host "         Body     : $($response.Content)" -ForegroundColor DarkRed
            $script:fail++
        }

        return $json

    } catch [System.Net.WebException] {
        $errStatus = [int]$_.Exception.Response.StatusCode
        $errBody   = ""
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errBody = $reader.ReadToEnd()
        } catch {}

        if ($errStatus -eq $ExpectStatus) {
            Write-Host "  [PASS] $Name (expected $ExpectStatus error)" -ForegroundColor Green
            Write-Host "         Status : $errStatus" -ForegroundColor DarkGreen
            Write-Host "         Body   : $errBody" -ForegroundColor DarkGreen
            $script:pass++
        } else {
            Write-Host "  [FAIL] $Name" -ForegroundColor Red
            Write-Host "         Status : $errStatus  (expected $ExpectStatus)" -ForegroundColor DarkRed
            Write-Host "         Body   : $errBody" -ForegroundColor DarkRed
            $script:fail++
        }
        return $null
    }
}

# ============================================================
#  0. HEALTH CHECK
# ============================================================
Write-Section "0 - HEALTH CHECK"

Invoke-Test `
    -Name         "GET /health -> 200" `
    -Method       GET `
    -Url          "$BASE/health" `
    -ExpectStatus 200 `
    -ExpectKeys   @("status")

# ============================================================
#  1. CREATE MEMBER
# ============================================================
Write-Section "1 - POST /erp/members"

$member = Invoke-Test `
    -Name         "Create member full details -> 201" `
    -Method       POST `
    -Url          "$BASE/erp/members" `
    -Body         @{
        first_name = "Amina$RUN"
        last_name  = "Omondi"
        mobile     = "0712345678"
        email      = "amina.$RUN@example.com"
        card_id    = "GYM-$RUN"
        is_active  = $true
    } `
    -ExpectStatus 201 `
    -ExpectKeys   @("customer_id", "account_id", "ml_number")

Invoke-Test `
    -Name         "Create member first_name only -> 201" `
    -Method       POST `
    -Url          "$BASE/erp/members" `
    -Body         @{
        first_name = "Test$RUN"
        last_name  = ""
        mobile     = ""
        email      = ""
        card_id    = "T-$RUN"
    } `
    -ExpectStatus 201 `
    -ExpectKeys   @("customer_id", "account_id", "ml_number")

Invoke-Test `
    -Name         "Create member missing first_name -> 422" `
    -Method       POST `
    -Url          "$BASE/erp/members" `
    -Body         @{
        last_name = "Kamau"
        mobile    = "0700000000"
    } `
    -ExpectStatus 422

# ============================================================
#  2. CREATE DEPOSIT
# ============================================================
Write-Section "2 - POST /erp/deposits"

$accountId = if ($member -and $member.account_id) { [int]$member.account_id } else { 3472 }
Write-Host "  Using AccountID: $accountId" -ForegroundColor DarkCyan

Invoke-Test `
    -Name         "Cash deposit 5000 -> 201" `
    -Method       POST `
    -Url          "$BASE/erp/deposits" `
    -Body         @{
        account_id      = $accountId
        amount          = 5000.00
        payment_method  = "cash"
        narration       = "Monthly membership fee"
        cash_account_id = 543
    } `
    -ExpectStatus 201 `
    -ExpectKeys   @("serial_number", "vch_number", "amount")

Invoke-Test `
    -Name         "Mpesa deposit 2500 -> 201" `
    -Method       POST `
    -Url          "$BASE/erp/deposits" `
    -Body         @{
        account_id      = $accountId
        amount          = 2500.00
        payment_method  = "mpesa"
        narration       = "Mpesa REF: QWE456RTY"
        cash_account_id = 543
    } `
    -ExpectStatus 201 `
    -ExpectKeys   @("serial_number", "vch_number", "amount")

Invoke-Test `
    -Name         "Deposit amount=0 -> 400" `
    -Method       POST `
    -Url          "$BASE/erp/deposits" `
    -Body         @{
        account_id = $accountId
        amount     = 0
    } `
    -ExpectStatus 400

Invoke-Test `
    -Name         "Deposit missing account_id -> 422" `
    -Method       POST `
    -Url          "$BASE/erp/deposits" `
    -Body         @{
        amount = 1000
    } `
    -ExpectStatus 422

# ============================================================
#  3. CREATE SALE
# ============================================================
Write-Section "3 - POST /erp/sales"

$customerId = if ($member -and $member.customer_id) { $member.customer_id } else { "00244" }
Write-Host "  Using CustomerID: $customerId   AccountID: $accountId" -ForegroundColor DarkCyan

Invoke-Test `
    -Name         "Membership sale 1 item -> 201" `
    -Method       POST `
    -Url          "$BASE/erp/sales" `
    -Body         @{
        customer_id = $customerId
        account_id  = $accountId
        items       = @(
            @{
                product_id    = "0001"
                quantity      = 1
                sale_rate     = 5000.00
                mrp           = 5500.00
                tax_id        = 1
                tax_rate      = 16.0
                tax_amount    = 800.0
                taxable_value = 5000.0
            }
        )
        subtotal    = 5000.00
        tax_total   = 800.00
        bill_amount = 5800.00
        session_id  = "0001CR"
    } `
    -ExpectStatus 201 `
    -ExpectKeys   @("serial_number", "vch_number", "bill_amount")

Invoke-Test `
    -Name         "Multi-item sale 2 items -> 201" `
    -Method       POST `
    -Url          "$BASE/erp/sales" `
    -Body         @{
        customer_id = $customerId
        account_id  = $accountId
        items       = @(
            @{
                product_id    = "0001"
                quantity      = 1
                sale_rate     = 45000.00
                mrp           = 50000.00
                tax_id        = 1
                tax_rate      = 16.0
                tax_amount    = 7200.0
                taxable_value = 45000.0
            },
            @{
                product_id    = "0002"
                quantity      = 1
                sale_rate     = 2000.00
                mrp           = 2000.00
                tax_id        = 1
                tax_rate      = 0.0
                tax_amount    = 0.0
                taxable_value = 2000.0
            }
        )
        subtotal    = 47000.00
        tax_total   = 7200.00
        bill_amount = 54200.00
        session_id  = "0001CR"
    } `
    -ExpectStatus 201 `
    -ExpectKeys   @("serial_number", "vch_number", "bill_amount")

Invoke-Test `
    -Name         "Sale empty items -> 400" `
    -Method       POST `
    -Url          "$BASE/erp/sales" `
    -Body         @{
        customer_id = $customerId
        account_id  = $accountId
        items       = @()
        subtotal    = 0
        tax_total   = 0
        bill_amount = 0
    } `
    -ExpectStatus 400

Invoke-Test `
    -Name         "Sale bill_amount=0 -> 400" `
    -Method       POST `
    -Url          "$BASE/erp/sales" `
    -Body         @{
        customer_id = $customerId
        account_id  = $accountId
        items       = @(
            @{
                product_id    = "0001"
                quantity      = 1
                sale_rate     = 0
                mrp           = 0
                tax_id        = 0
                tax_rate      = 0
                tax_amount    = 0
                taxable_value = 0
            }
        )
        subtotal    = 0
        tax_total   = 0
        bill_amount = 0
    } `
    -ExpectStatus 400

Invoke-Test `
    -Name         "Sale missing customer_id -> 422" `
    -Method       POST `
    -Url          "$BASE/erp/sales" `
    -Body         @{
        account_id  = $accountId
        items       = @()
        bill_amount = 1000
    } `
    -ExpectStatus 422

# ============================================================
#  SUMMARY
# ============================================================
Write-Host ""
Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
$total = $pass + $fail
$color = if ($fail -eq 0) { "Green" } else { "Yellow" }
Write-Host "  RESULTS: $pass / $total passed" -ForegroundColor $color
if ($fail -gt 0) {
    Write-Host "  $fail test(s) FAILED" -ForegroundColor Red
}
Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
