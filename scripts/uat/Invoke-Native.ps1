function Invoke-Native {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory=$true)]
        [scriptblock]$Command,
        [string]$ErrorMessage = "Native command failed."
    )
    
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$ErrorMessage (Exit Code: $LASTEXITCODE)"
    }
}
