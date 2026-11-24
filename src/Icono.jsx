// Iconos de línea (lucide) con nombres en español. Sustituyen a los emojis para una interfaz más sobria y consistente en todos los dispositivos.
import {
  Users, KeyRound, Download, Upload, Pencil, ClipboardList, School, ChartColumn, Trash2, Save, Eye, User, Lock, Settings, FileText,
  Brain, Plus, MessageSquare, Target, Play, Package, Pause, Zap, ShieldCheck, ChartLine, Search, Inbox, Sprout, ScrollText, Link as Vinculo2,
  Globe, GraduationCap, Mail, Palette, Sun, Moon, CircleHelp, Banknote, History, Printer, Briefcase, Building2, Crown, Trophy, Pin,
  NotebookPen, Copy, LayoutDashboard, Grid3x3, CircleCheck, CircleX, TriangleAlert, Info, BookOpen, PenLine, Check, X, Layers, Network,
} from "lucide-react";

const MAPA = {
  usuarios: Users, llave: KeyRound, descargar: Download, subir: Upload, editar: Pencil, lista: ClipboardList, colegio: School, grafico: ChartColumn,
  papelera: Trash2, guardar: Save, ver: Eye, usuario: User, candado: Lock, ajustes: Settings, documento: FileText, cerebro: Brain, mas: Plus,
  mensaje: MessageSquare, objetivo: Target, jugar: Play, paquete: Package, pausa: Pause, rayo: Zap, escudo: ShieldCheck, lineas: ChartLine,
  buscar: Search, bandeja: Inbox, brote: Sprout, historial: ScrollText, vinculo: Vinculo2, mundo: Globe, birrete: GraduationCap, correo: Mail,
  paleta: Palette, sol: Sun, luna: Moon, ayuda: CircleHelp, dinero: Banknote, reloj: History, imprimir: Printer, maletin: Briefcase,
  edificio: Building2, corona: Crown, trofeo: Trophy, pin: Pin, notas: NotebookPen, dashboard: LayoutDashboard, matriz: Grid3x3,
  ok: CircleCheck, error: CircleX, aviso: TriangleAlert, info: Info, libro: BookOpen, pluma: PenLine, check: Check, cerrar: X, capas: Layers, red: Network, copiar: Copy,
};

/** <Ico n="guardar" /> · size en px · por defecto deja un pequeño margen a la derecha (para ir antes de un texto). */
export function Ico({ n, size = 14, style, sinMargen = false, ...resto }) {
  const Cmp = MAPA[n];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={2} aria-hidden="true" focusable="false" style={{ verticalAlign: "-0.17em", marginRight: sinMargen ? 0 : 5, flexShrink: 0, ...style }} {...resto} />;
}
export const ICONOS = Object.keys(MAPA);
