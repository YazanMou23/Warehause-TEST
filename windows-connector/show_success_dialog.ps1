Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="LogiFlow Connector Bereit" Height="360" Width="480"
        WindowStartupLocation="CenterScreen" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True">
    <Border CornerRadius="16" Background="#0F172A" BorderBrush="#334155" BorderThickness="1.5" Padding="28">
        <Border.Effect>
            <DropShadowEffect BlurRadius="30" ShadowDepth="8" Opacity="0.6" Color="#000000"/>
        </Border.Effect>
        <Grid>
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Header -->
            <StackPanel Grid.Row="0" Orientation="Vertical" Margin="0,0,0,16">
                <StackPanel Orientation="Horizontal" VerticalAlignment="Center" Margin="0,0,0,8">
                    <Border Background="#10B981" CornerRadius="8" Width="36" Height="36" Margin="0,0,12,0">
                        <TextBlock Text="✓" Foreground="White" FontSize="20" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <StackPanel VerticalAlignment="Center">
                        <TextBlock Text="LogiFlow Connector" Foreground="#F8FAFC" FontSize="18" FontWeight="Bold" FontFamily="Segoe UI"/>
                        <TextBlock Text="Installation erfolgreich abgeschlossen" Foreground="#94A3B8" FontSize="12" FontFamily="Segoe UI"/>
                    </StackPanel>
                </StackPanel>
            </StackPanel>

            <!-- Features Box -->
            <Border Grid.Row="1" Background="#1E293B" CornerRadius="12" BorderBrush="#334155" BorderThickness="1" Padding="16" Margin="0,0,0,20">
                <StackPanel VerticalAlignment="Center">
                    <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
                        <TextBlock Text="●" Foreground="#10B981" FontSize="10" VerticalAlignment="Center" Margin="0,0,8,0"/>
                        <TextBlock Text="Connector läuft im Hintergrund (Port 48281)" Foreground="#E2E8F0" FontSize="13" FontFamily="Segoe UI" FontWeight="SemiBold"/>
                    </StackPanel>
                    <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
                        <TextBlock Text="●" Foreground="#10B981" FontSize="10" VerticalAlignment="Center" Margin="0,0,8,0"/>
                        <TextBlock Text="Automatischer ADF-Dauereinzug (10–20+ Seiten) aktiviert" Foreground="#CBD5E1" FontSize="12" FontFamily="Segoe UI"/>
                    </StackPanel>
                    <StackPanel Orientation="Horizontal">
                        <TextBlock Text="●" Foreground="#10B981" FontSize="10" VerticalAlignment="Center" Margin="0,0,8,0"/>
                        <TextBlock Text="Autostart bei Windows-Anmeldung eingerichtet" Foreground="#CBD5E1" FontSize="12" FontFamily="Segoe UI"/>
                    </StackPanel>
                </StackPanel>
            </Border>

            <!-- Buttons -->
            <Grid Grid.Row="2">
                <Button Name="BtnClose" Content="Schließen" 
                        Background="#2563EB" Foreground="White" FontWeight="Bold" FontSize="13" FontFamily="Segoe UI"
                        Padding="16,10" BorderThickness="0" Cursor="Hand" HorizontalAlignment="Stretch">
                    <Button.Resources>
                        <Style TargetType="Border">
                            <Setter Property="CornerRadius" Value="10"/>
                        </Style>
                    </Button.Resources>
                </Button>
            </Grid>
        </Grid>
    </Border>
</Window>
"@

$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
$window = [System.Windows.Markup.XamlReader]::Load($reader)

$btnClose = $window.FindName("BtnClose")

$btnClose.Add_Click({
    $window.Close()
})

$window.ShowDialog() | Out-Null
