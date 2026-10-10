# Windows renderer for the code-native social cards. No network or image API required.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$cards = Get-Content (Join-Path $PSScriptRoot 'social-images.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$output = Join-Path $root 'src/assets/seo'
[IO.Directory]::CreateDirectory($output) | Out-Null

function Brush($color) { return [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($color)) }
function Box($x, $y, $w, $h, $color, $radius = 14) {
    $p = [Drawing.Drawing2D.GraphicsPath]::new()
    $d = $radius * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
    $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
    $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
    $p.CloseFigure()
    $b = Brush $color
    $g.FillPath($b, $p)
    $b.Dispose(); $p.Dispose()
}
function Label($text, $x, $y, $size, $color = '#161616', $bold = $false) {
    $style = if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
    $f = [Drawing.Font]::new('Segoe UI', $size, $style, [Drawing.GraphicsUnit]::Pixel)
    $b = Brush $color
    $g.DrawString([string]$text, $f, $b, [single]$x, [single]$y)
    $f.Dispose(); $b.Dispose()
}
function Dot($x, $y, $size, $color) {
    $b = Brush $color
    $g.FillEllipse($b, [single]$x, [single]$y, [single]$size, [single]$size)
    $b.Dispose()
}
function Lines($x, $y, $width) {
    Box $x $y $width 8 '#dedfe1' 4
    Box $x ($y + 20) ($width * 0.68) 8 '#ecedef' 4
}

foreach ($card in $cards) {
    $bitmap = [Drawing.Bitmap]::new(2400, 1260)
    $g = [Drawing.Graphics]::FromImage($bitmap)
    $g.ScaleTransform(2, 2)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([Drawing.ColorTranslator]::FromHtml('#fafaf8'))
    Box 0 0 1200 9 '#c5a15a' 1
    Box 56 55 42 42 '#161616' 12
    Label 'H' 65 58 29 '#f4ebd9' $true
    Label 'Hotel Upwork' 113 55 28 '#161616' $true
    Label 'СИСТЕМА УПРАВЛІННЯ ГОТЕЛЕМ' 58 149 14 '#987434' $true

    # Keep Cyrillic headings fully inside the left column, with deliberate line wrapping.
    $f = [Drawing.Font]::new('Segoe UI', 48, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
    $lines = [Collections.Generic.List[string]]::new()
    $line = ''
    foreach ($word in ($card.title -split ' ')) {
        $candidate = if ($line) { "$line $word" } else { $word }
        if ($g.MeasureString($candidate, $f).Width -gt 555 -and $line) { $lines.Add($line); $line = $word } else { $line = $candidate }
    }
    $lines.Add($line)
    $f.Dispose()
    $y = 201
    foreach ($line in $lines) { Label $line 54 $y 48 '#161616' $true; $y += 59 }
    $subFont = [Drawing.Font]::new('Segoe UI', 23, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $subBrush = Brush '#707174'
    $g.DrawString($card.subtitle, $subFont, $subBrush, [Drawing.RectangleF]::new(58, ($y + 18), 525, 92))
    $subFont.Dispose(); $subBrush.Dispose()

    # Abstract product illustrations: sample layouts, never real guest data or claimed metrics.
    Box 647 160 493 369 '#ecedef' 22
    Box 640 150 493 369 '#ffffff' 22
    Dot 662 171 8 '#c5a15a'; Dot 678 171 8 '#dedfe1'; Dot 694 171 8 '#dedfe1'
    Label 'HOTEL UPWORK' 959 167 12 '#707174' $true
    switch ($card.kind) {
        'calendar' {
            Label 'Бронювання' 666 202 24 '#161616' $true
            for ($col = 0; $col -lt 7; $col++) {
                Label (17 + $col) (735 + $col * 51) 253 15 '#707174'
                Box (730 + $col * 51) 284 1 192 '#ecedef' 0.5
            }
            for ($row = 0; $row -lt 4; $row++) {
                Label (101 + $row) 666 (299 + $row * 45) 16 '#707174'
                $start = 741 + ($row % 3) * 51
                $color = @('#e7dfcf', '#e0ebe3', '#e6e6e9', '#f4ebd9')[$row]
                Box $start (296 + $row * 45) (145 + ($row % 2) * 48) 32 $color 8
            }
        }
        'chart' {
            Label 'Огляд показників' 666 202 24 '#161616' $true
            for ($i = 0; $i -lt 3; $i++) { Box (666 + $i * 143) 252 129 59 '#f5f5f6'; Lines (680 + $i * 143) 267 82 }
            for ($i = 0; $i -lt 9; $i++) {
                $h = @(63, 92, 77, 127, 111, 148, 139, 164, 180)[$i]
                $color = if ($i -eq 8) { '#c5a15a' } else { '#e7dfcf' }
                Box (680 + $i * 47) (488 - $h) 29 $h $color 6
            }
        }
        'grid' {
            Label 'Робота готелю' 666 202 24 '#161616' $true
            for ($i = 0; $i -lt 6; $i++) {
                $x = 666 + ($i % 3) * 144; $y = 256 + [Math]::Floor($i / 3) * 116
                Box $x $y 129 100 '#f5f5f6'
                Label (101 + $i) ($x + 14) ($y + 11) 25 '#161616' $true
                Box ($x + 14) ($y + 59) 83 22 @('#e0ebe3', '#f4ebd9', '#e6e6e9')[$i % 3] 8
            }
        }
        'people' {
            Label 'Люди та історія' 666 202 24 '#161616' $true
            for ($i = 0; $i -lt 3; $i++) {
                $y = 257 + $i * 76
                Box 666 $y 438 65 '#f5f5f6'
                Dot 681 ($y + 12) 39 @('#e7dfcf', '#e0ebe3', '#e6e6e9')[$i]
                Lines 738 ($y + 17) (192 - $i * 22)
                Box 1029 ($y + 23) 51 18 '#e0ebe3' 7
            }
        }
        'chat' {
            Label $(if ($card.slug -eq 'ai') { 'AI-помічник' } else { 'Повідомлення' }) 666 202 24 '#161616' $true
            Box 666 253 305 67 '#f5f5f6'; Lines 686 271 245
            Box 779 336 325 68 '#f4ebd9'; Lines 799 354 257
            Box 666 431 438 48 '#f5f5f6'; Label 'Напишіть повідомлення…' 682 443 17 '#707174'
            Box 1056 439 31 31 '#c5a15a' 9; Label '↑' 1063 439 22 '#ffffff' $true
        }
        'flow' {
            Label 'Усе на своєму місці' 666 202 24 '#161616' $true
            for ($i = 0; $i -lt 3; $i++) {
                $y = 257 + $i * 77
                if ($i -lt 2) { Box 692 ($y + 25) 2 79 '#e7dfcf' 1 }
                Dot 675 ($y + 13) 36 '#f4ebd9'; Label ($i + 1) 685 ($y + 18) 18 '#987434' $true
                Box 734 $y 369 64 '#f5f5f6'; Lines 754 ($y + 17) (254 - $i * 28)
            }
        }
        'pricing' {
            Label 'Оберіть свій план' 666 202 24 '#161616' $true
            for ($i = 0; $i -lt 3; $i++) {
                $x = 666 + $i * 144
                Box $x 256 129 220 $(if ($i -eq 1) { '#f4ebd9' } else { '#f5f5f6' })
                Label @('Start', 'Pro', 'Enterprise')[$i] ($x + 11) 276 19 '#161616' $true
                for ($r = 0; $r -lt 4; $r++) { Box ($x + 13) (326 + $r * 25) (94 - ($r % 2) * 19) 7 '#dedfe1' 3 }
                Box ($x + 13) 439 103 21 '#c5a15a' 6
            }
        }
        default {
            Label $(if ($card.kind -eq 'document') { 'Дані та прозорість' } else { 'Деталі та налаштування' }) 666 202 24 '#161616' $true
            for ($i = 0; $i -lt 3; $i++) {
                $y = 255 + $i * 62
                Box 668 $y (103 + $i * 30) 7 '#dedfe1' 3
                Box 666 ($y + 18) 438 32 '#f5f5f6' 8
            }
            Box 949 456 154 28 '#c5a15a' 8
        }
    }
    Label 'hotelup.work' 58 558 21 '#161616' $true
    Label $(if ($card.route -in @('', 'pricing', 'pitch', 'proposal', 'privacy', 'cookies', 'login')) { 'Для незалежних готелів' } else { 'Демо системи' }) 885 560 17 '#707174'

    $final = [Drawing.Bitmap]::new(1200, 630)
    $fg = [Drawing.Graphics]::FromImage($final)
    $fg.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $fg.DrawImage($bitmap, 0, 0, 1200, 630)
    $encoder = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
    $parameters = [Drawing.Imaging.EncoderParameters]::new(1)
    $parameters.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [long]92)
    $final.Save((Join-Path $output ($card.slug + '.jpg')), $encoder, $parameters)
    $parameters.Dispose(); $fg.Dispose(); $final.Dispose(); $g.Dispose(); $bitmap.Dispose()
}
Write-Output "Rendered $($cards.Count) social images to $output"
