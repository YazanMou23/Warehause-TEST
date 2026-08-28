Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="LogiFlow Connector Bereit" Height="400" Width="400"
        WindowStartupLocation="CenterScreen" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True">
    <Window.Resources>
        <!-- Modern Button Style -->
        <Style x:Key="ModernButton" TargetType="Button">
            <Setter Property="Background" Value="#FFFFFF"/>
            <Setter Property="Foreground" Value="#0F172A"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="FontSize" Value="14"/>
            <Setter Property="FontFamily" Value="Segoe UI"/>
            <Setter Property="Padding" Value="0,14"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" CornerRadius="12">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter Property="Background" Value="#F1F5F9"/>
                            </Trigger>
                            <Trigger Property="IsPressed" Value="True">
                                <Setter Property="Background" Value="#E2E8F0"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
    </Window.Resources>

    <Border CornerRadius="20" Background="#0B0F19" BorderBrush="#1E293B" BorderThickness="1" Padding="32">
        <Border.Effect>
            <DropShadowEffect BlurRadius="40" ShadowDepth="10" Opacity="0.5" Color="#000000"/>
        </Border.Effect>
        
        <Grid>
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Icon and Header -->
            <StackPanel Grid.Row="0" HorizontalAlignment="Center" Margin="0,0,0,24">
                <Border Background="#10B981" CornerRadius="100" Width="56" Height="56" Margin="0,0,0,16" HorizontalAlignment="Center">
                    <Path Data="M 18 28 L 25 35 L 38 18" Stroke="White" StrokeThickness="4" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                </Border>
                <TextBlock Text="Connector Installiert" Foreground="#FFFFFF" FontSize="22" FontWeight="Bold" FontFamily="Segoe UI" HorizontalAlignment="Center" Margin="0,0,0,8"/>
                <TextBlock Text="Der Scanner-Service ist nun einsatzbereit." Foreground="#94A3B8" FontSize="14" FontFamily="Segoe UI" HorizontalAlignment="Center"/>
            </StackPanel>

            <!-- Features Box -->
            <Border Grid.Row="1" Background="#131B2B" CornerRadius="12" BorderBrush="#1E293B" BorderThickness="1" Padding="20" Margin="0,0,0,28">
                <StackPanel VerticalAlignment="Center">
                    <StackPanel Orientation="Horizontal" Margin="0,0,0,12">
                        <Path Data="M0,5 L5,10 L12,2" Stroke="#10B981" StrokeThickness="2" Width="12" Height="12" Stretch="Fill" Margin="0,2,12,0"/>
                        <TextBlock Text="Läuft im Hintergrund (Port 48281)" Foreground="#E2E8F0" FontSize="13" FontFamily="Segoe UI" FontWeight="Medium"/>
                    </StackPanel>
                    <StackPanel Orientation="Horizontal" Margin="0,0,0,12">
                        <Path Data="M0,5 L5,10 L12,2" Stroke="#10B981" StrokeThickness="2" Width="12" Height="12" Stretch="Fill" Margin="0,2,12,0"/>
                        <TextBlock Text="Automatischer ADF-Dauereinzug" Foreground="#E2E8F0" FontSize="13" FontFamily="Segoe UI" FontWeight="Medium"/>
                    </StackPanel>
                    <StackPanel Orientation="Horizontal">
                        <Path Data="M0,5 L5,10 L12,2" Stroke="#10B981" StrokeThickness="2" Width="12" Height="12" Stretch="Fill" Margin="0,2,12,0"/>
                        <TextBlock Text="Autostart bei Windows-Anmeldung" Foreground="#E2E8F0" FontSize="13" FontFamily="Segoe UI" FontWeight="Medium"/>
                    </StackPanel>
                </StackPanel>
            </Border>

            <!-- Buttons -->
            <Button Grid.Row="2" Name="BtnClose" Content="Verstanden &amp; Schließen" Style="{StaticResource ModernButton}" HorizontalAlignment="Stretch"/>
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
