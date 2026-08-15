"use client";

import React, { useState, useEffect } from "react";
import {
  Palette,
  Plus,
  Trash2,
  Check,
  Sparkles,
  Copy,
  Layers,
  CheckCircle2,
} from "lucide-react";

interface HallColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  showPreview?: boolean;
}

export const PRESET_PALETTES = [
  {
    name: "Classic Corporate",
    colors: [
      { hex: "#1d4ed8", label: "Royal Blue" },
      { hex: "#0284c7", label: "Sky Blue" },
      { hex: "#0f766e", label: "Teal Green" },
      { hex: "#334155", label: "Slate Navy" },
    ],
  },
  {
    name: "Vibrant & Alert",
    colors: [
      { hex: "#dc2626", label: "Crimson Red" },
      { hex: "#ea580c", label: "Safety Orange" },
      { hex: "#d97706", label: "Amber Yellow" },
      { hex: "#db2777", label: "Rose Magenta" },
    ],
  },
  {
    name: "Fresh & Logistic",
    colors: [
      { hex: "#059669", label: "Emerald Green" },
      { hex: "#16a34a", label: "Traffic Green" },
      { hex: "#65a30d", label: "Lime Olive" },
      { hex: "#0891b2", label: "Cyan Sector" },
    ],
  },
  {
    name: "Modern & Creative",
    colors: [
      { hex: "#7c3aed", label: "Violet Iris" },
      { hex: "#9333ea", label: "Amethyst Purple" },
      { hex: "#4f46e5", label: "Indigo Deep" },
      { hex: "#b45309", label: "Bronze Gold" },
    ],
  },
];

const LOCAL_STORAGE_CUSTOM_COLORS = "logiflow_custom_hall_colors";

// Helper to determine readable text color against background
export function getContrastTextColor(hexColor: string): "text-white" | "text-slate-900" {
  if (!hexColor || !hexColor.startsWith("#")) return "text-white";
  const hex = hexColor.replace("#", "");
  const fullHex = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(fullHex.substring(0, 2), 16) || 0;
  const g = parseInt(fullHex.substring(2, 4), 16) || 0;
  const b = parseInt(fullHex.substring(4, 6), 16) || 0;
  // Perceived brightness formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "text-slate-900" : "text-white";
}

export default function HallColorPicker({
  color,
  onChange,
  label = "Hallen-Farbsystem (Sector Color)",
  showPreview = true,
}: HallColorPickerProps) {
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [hexInput, setHexInput] = useState(color || "#1d4ed8");
  const [copied, setCopied] = useState(false);

  // Load custom saved colors from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_CUSTOM_COLORS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomColors(parsed);
        }
      } else {
        // Initial defaults
        const defaults = ["#2563eb", "#e11d48", "#10b981", "#8b5cf6", "#f59e0b"];
        setCustomColors(defaults);
        localStorage.setItem(LOCAL_STORAGE_CUSTOM_COLORS, JSON.stringify(defaults));
      }
    } catch (e) {
      console.warn("Could not load custom colors from storage", e);
    }
  }, []);

  // Synchronize internal hex input when color prop changes
  useEffect(() => {
    if (color && color !== hexInput) {
      setHexInput(color);
    }
  }, [color]);

  const handleSelectColor = (selectedHex: string) => {
    setHexInput(selectedHex);
    onChange(selectedHex);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith("#")) {
      val = "#" + val;
    }
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val);
    }
  };

  const handleSaveToCustomPalette = () => {
    const validHex = hexInput.startsWith("#") ? hexInput.toLowerCase() : `#${hexInput}`.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(validHex)) return;

    if (!customColors.includes(validHex)) {
      const updated = [validHex, ...customColors.slice(0, 15)]; // keep up to 16 custom colors
      setCustomColors(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_CUSTOM_COLORS, JSON.stringify(updated));
      } catch (e) {}
    }
  };

  const handleRemoveCustomColor = (colorToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customColors.filter((c) => c.toLowerCase() !== colorToRemove.toLowerCase());
    setCustomColors(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_CUSTOM_COLORS, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleCopyHex = () => {
    navigator.clipboard.writeText(color);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const activeColor = color || hexInput || "#1d4ed8";
  const contrastText = getContrastTextColor(activeColor);

  return (
    <div className="space-y-3.5 bg-slate-50/60 p-4 rounded-xl border border-slate-200/80">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-blue-600" />
          {label}
        </label>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
          HEX Code
        </span>
      </div>

      {/* Main Color Picker Input Row */}
      <div className="flex items-center gap-3">
        <div className="relative group">
          <input
            type="color"
            value={activeColor.length === 7 ? activeColor : "#1d4ed8"}
            onChange={(e) => handleSelectColor(e.target.value)}
            className="w-12 h-12 rounded-xl border-2 border-white shadow-md cursor-pointer p-0 bg-transparent transition-transform hover:scale-105"
            title="Klicken für Farbauswahl"
          />
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow pointer-events-none">
            <Sparkles className="w-3 h-3 text-amber-500" />
          </div>
        </div>

        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              maxLength={7}
              placeholder="#1d4ed8"
              value={hexInput}
              onChange={handleHexInputChange}
              className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs uppercase"
            />
            <button
              type="button"
              onClick={handleCopyHex}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 transition-colors"
              title="Farbcode kopieren"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveToCustomPalette}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
            title="Aktuelle Farbe zur eigenen Farbpalette hinzufügen"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Farbe merken</span>
          </button>
        </div>
      </div>

      {/* User Custom Saved Palette */}
      {customColors.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-500" />
              Meine benutzerdefinierten Farben ({customColors.length})
            </span>
            <span className="text-[9px] text-slate-400">Klick zum Anwenden</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {customColors.map((hex, idx) => {
              const isSelected = activeColor.toLowerCase() === hex.toLowerCase();
              return (
                <div
                  key={`${hex}-${idx}`}
                  onClick={() => handleSelectColor(hex)}
                  className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer transition-all border shadow-2xs ${
                    isSelected
                      ? "ring-2 ring-blue-500 ring-offset-1 border-blue-400 scale-105"
                      : "border-slate-200/80 hover:scale-105 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: hex }}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 text-white drop-shadow-sm" />}
                  </span>
                  <span className="text-slate-700">{hex}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveCustomColor(hex, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-opacity ml-0.5 p-0.5 rounded hover:bg-slate-100"
                    title="Aus gemerkten Farben entfernen"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preset Curated Palettes */}
      <div className="space-y-2 pt-1 border-t border-slate-200">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
          Standard-Farbpaletten
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESET_PALETTES.map((palette) => (
            <div key={palette.name} className="bg-white p-2 rounded-lg border border-slate-200 space-y-1.5 shadow-2xs">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight block truncate">
                {palette.name}
              </span>
              <div className="flex gap-1.5">
                {palette.colors.map((pColor) => {
                  const isSelected = activeColor.toLowerCase() === pColor.hex.toLowerCase();
                  return (
                    <button
                      key={pColor.hex}
                      type="button"
                      onClick={() => handleSelectColor(pColor.hex)}
                      className={`w-5 h-5 rounded-md transition-all cursor-pointer border ${
                        isSelected
                          ? "ring-2 ring-slate-800 ring-offset-1 scale-110 border-white shadow-sm"
                          : "border-transparent hover:scale-110"
                      }`}
                      style={{ backgroundColor: pColor.hex }}
                      title={`${pColor.label} (${pColor.hex})`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview of Hall Badge & Card Border */}
      {showPreview && (
        <div className="pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" />
              Live-Vorschau (Design Integration)
            </span>
          </div>

          <div
            className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between transition-all"
            style={{ borderLeft: `5px solid ${activeColor}` }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-2xs"
                style={{
                  backgroundColor: `${activeColor}20`,
                  color: activeColor,
                }}
              >
                <Palette className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Halle / Sector Vorschau</span>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold shadow-2xs ${contrastText}`}
                    style={{ backgroundColor: activeColor }}
                  >
                    Aktiv
                  </span>
                </p>
                <p className="text-[10px] text-slate-400 font-mono">Farbcode: {activeColor}</p>
              </div>
            </div>

            <span
              className="text-[10px] font-bold font-mono px-2 py-1 rounded border shadow-2xs flex items-center gap-1"
              style={{
                borderColor: `${activeColor}60`,
                backgroundColor: `${activeColor}15`,
                color: activeColor,
              }}
            >
              <CheckCircle2 className="w-3 h-3" />
              Harmonisch
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
