#property copyright "XAUUSD AI MASTER"
#property version   "1.37"
#property description "Read-only Phase 7C semantic canvas decision panel v5.2"

#include <Canvas\Canvas.mqh>

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c-ui/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;

const string LEGACY_PREFIX = "XAU_AI_P7C_";
const string CANVAS_NAME = "XAU_AI_P7C_CANVAS_V5";
const int PANEL_MIN_WIDTH = 760;
const int PANEL_MAX_WIDTH = 860;
const int WAITING_HEIGHT = 550;
const int SETUP_HEIGHT = 540;
const int MANAGING_HEIGHT = 590;
// Required installer safety marker: READ ONLY | DEMO | ORDER PERMISSION = NONE

CCanvas g_canvas;
bool g_canvas_ready = false;
int g_canvas_width = 0;
int g_canvas_height = 0;

uint A(const color value, const int alpha=255)
{
   return ColorToARGB(value, (uchar)MathMax(0, MathMin(255, alpha)));
}

string Field(const string payload, const string wanted)
{
   string lines[];
   ushort separator = (ushort)StringGetCharacter("\n", 0);
   int count = StringSplit(payload, separator, lines);
   for(int index = 0; index < count; index++)
   {
      int equals = StringFind(lines[index], "=");
      if(equals <= 0)
         continue;
      if(StringSubstr(lines[index], 0, equals) == wanted)
         return StringSubstr(lines[index], equals + 1);
   }
   return "n/a";
}

bool EmptyValue(const string value)
{
   return value == "" || value == "n/a" || value == "N/A" || value == "null" || value == "undefined" || value == "-";
}

string Clean(const string value, const string fallback="-")
{
   return EmptyValue(value) ? fallback : value;
}

int PanelWidth()
{
   int chart_width = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int target = (int)MathRound(chart_width * 0.40);
   target = (int)MathMax(PANEL_MIN_WIDTH, MathMin(PANEL_MAX_WIDTH, target));
   if(chart_width > 100)
      target = (int)MathMin(target, chart_width - 24);
   return (int)MathMax(620, target);
}

void PurgeLegacyPanelObjects()
{
   for(int index = ObjectsTotal(0) - 1; index >= 0; index--)
   {
      string name = ObjectName(0, index);
      if(StringFind(name, LEGACY_PREFIX) == 0)
         ObjectDelete(0, name);
   }
}

void DestroyCanvas()
{
   if(g_canvas_ready)
   {
      g_canvas.Destroy();
      g_canvas_ready = false;
   }
   ObjectDelete(0, CANVAS_NAME);
   g_canvas_width = 0;
   g_canvas_height = 0;
}

bool EnsureCanvas(const int width, const int height)
{
   if(g_canvas_ready && g_canvas_width == width && g_canvas_height == height)
      return true;

   DestroyCanvas();
   if(!g_canvas.CreateBitmapLabel(0, 0, CANVAS_NAME, 0, 0, width, height, COLOR_FORMAT_ARGB_NORMALIZE))
      return false;

   ObjectSetInteger(0, CANVAS_NAME, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, CANVAS_NAME, OBJPROP_XDISTANCE, InpX);
   ObjectSetInteger(0, CANVAS_NAME, OBJPROP_YDISTANCE, InpY);
   ObjectSetInteger(0, CANVAS_NAME, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, CANVAS_NAME, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, CANVAS_NAME, OBJPROP_BACK, false);

   g_canvas_width = width;
   g_canvas_height = height;
   g_canvas_ready = true;
   return true;
}

void SetFont(const int px)
{
   g_canvas.FontSet("Segoe UI", -px * 10);
}

string FitText(const string source, const int max_width, const int px)
{
   string text = source;
   SetFont(px);
   if(g_canvas.TextWidth(text) <= max_width)
      return text;

   const string suffix = "...";
   while(StringLen(text) > 1 && g_canvas.TextWidth(text + suffix) > max_width)
      text = StringSubstr(text, 0, StringLen(text) - 1);
   return text + suffix;
}

void Text(const int x, const int y, const string value, const color clr, const int px)
{
   SetFont(px);
   g_canvas.TextOut(x, y, value, A(clr), 0);
}

void TextRight(const int right_x, const int y, const string value, const color clr, const int px)
{
   SetFont(px);
   int width = g_canvas.TextWidth(value);
   g_canvas.TextOut(right_x - width, y, value, A(clr), 0);
}

void TextCenter(const int center_x, const int y, const string value, const color clr, const int px)
{
   SetFont(px);
   int width = g_canvas.TextWidth(value);
   g_canvas.TextOut(center_x - width / 2, y, value, A(clr), 0);
}

void Card(const int x, const int y, const int width, const int height, const color fill, const color border)
{
   g_canvas.FillRectangle(x, y, x + width, y + height, A(fill, 252));
   g_canvas.Rectangle(x, y, x + width, y + height, A(border, 235));
}

color ModeTone(const string mode, const string strategy)
{
   if(mode == "PAUSE" || strategy == "PAUSE") return clrOrange;
   if(mode == "AUTO") return clrLimeGreen;
   if(mode == "TREND") return clrDeepSkyBlue;
   if(mode == "SIDEWAY") return clrAqua;
   return clrGold;
}

color RegimeTone(const string regime)
{
   if(regime == "REVERSAL") return clrOrange;
   if(regime == "TREND") return clrDeepSkyBlue;
   if(regime == "SIDEWAY") return clrAqua;
   return clrSilver;
}

string GateText(const string gate)
{
   if(gate == "ALLOWED") return "DUOC PHEP";
   if(gate == "BLOCKED_BY_MODE") return "CHAN DO MODE";
   if(gate == "BLOCKED_BY_REGIME") return "CHUA CHO PHEP";
   return "DANG CHO";
}

color GateTone(const string gate)
{
   if(gate == "ALLOWED") return clrLimeGreen;
   if(gate == "BLOCKED_BY_MODE") return clrOrange;
   if(gate == "BLOCKED_BY_REGIME") return clrGold;
   return clrSilver;
}

void BeginPanel(const int width, const int height)
{
   g_canvas.Erase(A(C'3,10,18', 255));
   g_canvas.FillRectangle(0, 0, width - 1, height - 1, A(C'3,10,18', 255));
   g_canvas.Rectangle(0, 0, width - 1, height - 1, A(C'0,190,225'));
   g_canvas.FillRectangle(8, 6, width - 9, 8, A(C'0,210,255'));
}

void DrawHeader(const int width, const string mode, const string strategy, const string regime, const string confidence)
{
   const int x = 14;
   const int y = 16;
   const int w = width - 28;
   const int h = 104;
   Card(x, y, w, h, C'7,20,30', C'0,80,110');

   Text(x + 18, y + 12, "XAUUSD AI MASTER", clrDeepSkyBlue, 14);
   TextRight(x + w - 18, y + 14, "FINAL v5.2", clrGold, 9);
   Text(x + 18, y + 40, "Phase 7C | DEMO | READ ONLY", clrSilver, 9);
   Text(x + 18, y + 62, "Mode: " + Clean(mode), ModeTone(mode, strategy), 10);
   TextRight(x + w - 18, y + 62, "Effective: " + Clean(strategy), ModeTone(mode, strategy), 9);
   Text(x + 18, y + 82, "Regime: " + Clean(regime), RegimeTone(regime), 10);
   TextRight(x + w - 18, y + 82, "Confidence: " + Clean(confidence) + "%", RegimeTone(regime), 10);
}

void DrawStateCard(const int width, const string title, const string stage, const string action, const color tone)
{
   const int x = 14;
   const int y = 128;
   const int w = width - 28;
   const int h = 68;
   Card(x, y, w, h, C'9,24,34', tone);
   Text(x + 18, y + 12, title, tone, 11);
   Text(x + 18, y + 40, "Stage: " + Clean(stage), clrWhite, 9);
   TextRight(x + w - 18, y + 40, action, clrSilver, 9);
}

void DrawReasons(const int width, const int y, const string title, const string r1, const string r2, const string r3, const color tone)
{
   const int x = 14;
   const int w = width - 28;
   const int h = 120;
   Card(x, y, w, h, C'7,21,30', C'0,72,102');
   Text(x + 18, y + 12, title, tone, 10);
   int max_text_width = w - 54;
   string a = FitText(Clean(r1, "Chua co ly do tu engine"), max_text_width, 9);
   string b = FitText(Clean(r2, ""), max_text_width, 9);
   string c = FitText(Clean(r3, ""), max_text_width, 9);
   Text(x + 28, y + 42, "- " + a, clrWhite, 9);
   if(StringLen(b) > 0) Text(x + 28, y + 66, "- " + b, clrSilver, 9);
   if(StringLen(c) > 0) Text(x + 28, y + 90, "- " + c, clrSilver, 9);
}

void DrawGateCard(const int width, const int y, const string trend, const string sideway, const string reversal, const string recommended)
{
   const int x = 14;
   const int w = width - 28;
   const int h = 132;
   const int label_x = x + 28;
   const int value_right = x + w - 28;
   Card(x, y, w, h, C'7,21,30', C'0,72,102');
   Text(x + 18, y + 12, "BOT GATE / FILTER", clrAqua, 10);

   Text(label_x, y + 42, "Trend", clrSilver, 9);
   TextRight(value_right, y + 42, GateText(trend), GateTone(trend), 9);
   Text(label_x, y + 64, "Sideway", clrSilver, 9);
   TextRight(value_right, y + 64, GateText(sideway), GateTone(sideway), 9);
   Text(label_x, y + 86, "Reversal filter", clrSilver, 9);
   TextRight(value_right, y + 86, reversal == "BLOCKING" ? "DANG CHAN" : "KHONG CHAN", reversal == "BLOCKING" ? clrOrange : clrLimeGreen, 9);
   Text(label_x, y + 108, "Recommended", clrSilver, 9);
   TextRight(value_right, y + 108, Clean(recommended), clrWhite, 9);
}

void DrawFooter(const int width, const int y)
{
   const int x = 14;
   const int w = width - 28;
   const int h = 62;
   Card(x, y, w, h, C'6,18,26', C'0,72,102');
   int center_x = x + w / 2;
   TextCenter(center_x, y + 12, "READ ONLY | DEMO | ORDER NONE", clrSilver, 8);
   TextCenter(center_x, y + 34, "BE +6 | PARTIAL +10 (1/3) | NEW POSITIONS ONLY", clrSilver, 8);
}

void DrawWaiting(const string payload, const int width)
{
   DrawStateCard(width, "BOT DANG CHO SETUP", Field(payload, "stage"), "Khong mo lenh moi", clrOrange);
   DrawReasons(width, 204, "LY DO CHUA VAO LENH", Field(payload, "waitReason1"), Field(payload, "waitReason2"), Field(payload, "waitReason3"), clrDeepSkyBlue);
   DrawGateCard(width, 332, Field(payload, "trendGate"), Field(payload, "sidewayGate"), Field(payload, "reversalFilter"), Field(payload, "recommendedMode"));
   DrawFooter(width, 472);
}

void DrawTradePlan(const string payload, const int width, const bool managing)
{
   const int x = 14;
   const int y = 128;
   const int w = width - 28;
   const int h = 88;
   Card(x, y, w, h, C'6,18,27', C'0,72,102');

   int gap = 8;
   int box_w = (w - 36 - gap * 2) / 3;
   int bx1 = x + 12;
   int bx2 = bx1 + box_w + gap;
   int bx3 = bx2 + box_w + gap;
   string entry = managing ? Field(payload, "positionEntry") : Field(payload, "setupEntry");
   string stop = managing ? Field(payload, "positionStopLoss") : Field(payload, "setupStopLoss");
   string tp = managing ? Field(payload, "positionTp2") : Field(payload, "setupTp2");
   if(EmptyValue(tp)) tp = managing ? Field(payload, "positionTp1") : Field(payload, "setupTp1");

   Card(bx1, y + 12, box_w, 62, C'7,25,38', C'0,120,170');
   Card(bx2, y + 12, box_w, 62, C'30,14,22', C'150,45,60');
   Card(bx3, y + 12, box_w, 62, C'12,28,20', C'50,150,75');
   Text(bx1 + 12, y + 20, "ENTRY", clrDeepSkyBlue, 8);
   Text(bx2 + 12, y + 20, "STOPLOSS", clrTomato, 8);
   Text(bx3 + 12, y + 20, "TP", clrLimeGreen, 8);
   Text(bx1 + 12, y + 42, FitText(Clean(entry), box_w - 24, 10), clrWhite, 10);
   Text(bx2 + 12, y + 42, FitText(Clean(stop), box_w - 24, 10), clrWhite, 10);
   Text(bx3 + 12, y + 42, FitText(Clean(tp), box_w - 24, 10), clrWhite, 10);
}

void DrawSetup(const string payload, const int width)
{
   DrawTradePlan(payload, width, false);
   DrawReasons(width, 224, "LY DO SETUP DUOC DUYET", Field(payload, "entryReason1"), Field(payload, "entryReason2"), Field(payload, "entryReason3"), clrLimeGreen);

   const int x = 14;
   const int y = 352;
   const int w = width - 28;
   Card(x, y, w, 88, C'7,21,30', C'0,72,102');
   Text(x + 18, y + 12, "LOT / RISK", clrAqua, 10);
   Text(x + 28, y + 42, "Strategy: " + Clean(Field(payload, "setupStrategy")), clrWhite, 9);
   TextRight(x + w - 28, y + 42, "Side: " + Clean(Field(payload, "setupSide")), clrWhite, 9);
   Text(x + 28, y + 64, "Lot: " + Clean(Field(payload, "setupFinalLot")), clrSilver, 9);
   TextRight(x + w - 28, y + 64, "Risk: " + Clean(Field(payload, "setupRiskPercent")) + "%", clrSilver, 9);
   DrawFooter(width, 448);
}

void DrawManaging(const string payload, const int width)
{
   DrawTradePlan(payload, width, true);

   const int x = 14;
   const int w = width - 28;
   Card(x, 224, w, 62, C'8,26,20', C'45,130,70');
   Text(x + 18, 238, "DANG GIU LENH", clrLimeGreen, 10);
   TextRight(x + w - 18, 238, "P/L: " + Clean(Field(payload, "floatingPnlUsd")) + " USD", clrWhite, 10);
   Text(x + 18, 260, "Side: " + Clean(Field(payload, "positionSide")) + " | Lot: " + Clean(Field(payload, "positionVolume")), clrSilver, 8);

   DrawReasons(width, 294, "LY DO GIU LENH", Field(payload, "holdReason1"), Field(payload, "holdReason2"), Field(payload, "holdReason3"), clrDeepSkyBlue);

   Card(x, 422, w, 80, C'7,21,30', C'0,72,102');
   Text(x + 18, 436, "QUAN TRI LENH", clrAqua, 10);
   Text(x + 28, 466, "BE +6", clrWhite, 9);
   Text(x + 150, 466, "Partial +10: chot 1/3", clrWhite, 9);
   TextRight(x + w - 28, 466, "READ ONLY", clrSilver, 9);
   DrawFooter(width, 510);
}

void RenderPanel(const string payload)
{
   string ui_state = Clean(Field(payload, "uiState"), "WAITING");
   int height = ui_state == "MANAGING" ? MANAGING_HEIGHT : (ui_state == "SETUP_READY" ? SETUP_HEIGHT : WAITING_HEIGHT);
   int width = PanelWidth();
   if(!EnsureCanvas(width, height))
      return;

   BeginPanel(width, height);
   DrawHeader(width,
      Field(payload, "activeMode"),
      Field(payload, "effectiveStrategy"),
      Field(payload, "regime"),
      Field(payload, "confidence"));

   if(ui_state == "MANAGING")
      DrawManaging(payload, width);
   else if(ui_state == "SETUP_READY")
      DrawSetup(payload, width);
   else
      DrawWaiting(payload, width);

   g_canvas.Update(true);
}

void RenderError(const string title, const string message)
{
   int width = PanelWidth();
   if(!EnsureCanvas(width, 300))
      return;
   BeginPanel(width, 300);
   Card(14, 16, width - 28, 266, C'12,18,26', C'180,60,60');
   Text(32, 34, "XAUUSD AI MASTER", clrDeepSkyBlue, 14);
   TextRight(width - 32, 36, "FINAL v5.2", clrGold, 9);
   Text(32, 78, title, clrTomato, 11);
   Text(32, 112, FitText(message, width - 64, 9), clrWhite, 9);
   Text(32, 156, "1. Allow WebRequest: http://127.0.0.1:3711", clrSilver, 8);
   Text(32, 180, "2. Kiem tra Control API/Bridge", clrSilver, 8);
   Text(32, 204, "3. Attach lai EA panel neu can", clrSilver, 8);
   TextCenter(width / 2, 250, "READ ONLY | DEMO | ORDER NONE", clrSilver, 8);
   g_canvas.Update(true);
}

void RefreshPanel()
{
   char request[];
   char response[];
   string response_headers;
   string headers = "Accept: text/plain\r\nCache-Control: no-store\r\n";
   ResetLastError();
   int status = WebRequest("GET", InpApiUrl, headers, 5000, request, response, response_headers);
   if(status == -1)
   {
      RenderError("KHONG GOI DUOC CONTROL API", "WebRequest error " + IntegerToString(GetLastError()));
      return;
   }
   if(status != 200)
   {
      RenderError("CONTROL API CHUA SAN SANG", "HTTP " + IntegerToString(status));
      return;
   }

   string payload = CharArrayToString(response, 0, -1, CP_UTF8);
   if(Field(payload, "version") != "2")
   {
      RenderError("DU LIEU UI KHONG HOP LE", "Semantic UI contract version khong phai 2");
      return;
   }
   RenderPanel(payload);
}

int OnInit()
{
   DestroyCanvas();
   PurgeLegacyPanelObjects();
   ChartRedraw();
   EventSetTimer((int)MathMax(1, InpRefreshSeconds));
   RefreshPanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   DestroyCanvas();
   PurgeLegacyPanelObjects();
   ChartRedraw();
}

void OnTimer()
{
   RefreshPanel();
}
