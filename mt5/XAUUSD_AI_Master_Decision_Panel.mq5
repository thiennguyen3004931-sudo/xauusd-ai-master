#property copyright "XAUUSD AI MASTER"
#property version   "1.41"
#property description "Bảng quyết định XAUUSD AI MASTER · compact · chỉ đọc · DEMO/LIVE aware"

#include <Canvas\Canvas.mqh>

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c-ui/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;

const string LEGACY_PREFIX = "XAU_AI_P7C_";
const string CANVAS_NAME = "XAU_AI_P7C_CANVAS_V7";
const int PANEL_MIN_WIDTH = 500;
const int PANEL_MAX_WIDTH = 620;
const int WAITING_HEIGHT = 420;
const int SETUP_HEIGHT = 425;
const int MANAGING_HEIGHT = 505;
// Required installer safety marker: READ ONLY | DEMO/LIVE | ORDER PERMISSION = NONE

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

bool BoolField(const string payload, const string key)
{
   string value = Field(payload, key);
   return value == "true" || value == "True" || value == "TRUE" || value == "1";
}

string LocalAccountMode()
{
   long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(mode == ACCOUNT_TRADE_MODE_REAL) return "LIVE";
   if(mode == ACCOUNT_TRADE_MODE_DEMO) return "DEMO";
   if(mode == ACCOUNT_TRADE_MODE_CONTEST) return "CONTEST";
   return "UNKNOWN";
}

bool RuntimeMatchesTerminal(const string payload)
{
   string runtime_mode = Clean(Field(payload, "accountMode"), "UNKNOWN");
   string terminal_mode = LocalAccountMode();
   if(runtime_mode != "DEMO" && runtime_mode != "LIVE") return false;
   return runtime_mode == terminal_mode;
}

int PanelWidth()
{
   int chart_width = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int target = (int)MathRound(chart_width * 0.32);
   target = (int)MathMax(PANEL_MIN_WIDTH, MathMin(PANEL_MAX_WIDTH, target));
   if(chart_width > 100)
      target = (int)MathMin(target, chart_width - 24);
   return (int)MathMax(460, target);
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

void WrapTextTwoLines(
   const string source,
   const int max_width,
   const int px,
   string &line1,
   string &line2
)
{
   string text = Clean(source, "-");
   line1 = text;
   line2 = "";
   SetFont(px);

   if(g_canvas.TextWidth(text) <= max_width)
      return;

   string words[];
   ushort separator = (ushort)StringGetCharacter(" ", 0);
   int count = StringSplit(text, separator, words);
   if(count <= 1)
   {
      line1 = FitText(text, max_width, px);
      return;
   }

   line1 = "";
   int split_index = 0;
   for(int index = 0; index < count; index++)
   {
      string candidate = line1 == "" ? words[index] : line1 + " " + words[index];
      if(line1 != "" && g_canvas.TextWidth(candidate) > max_width)
         break;

      line1 = candidate;
      split_index = index + 1;
      if(g_canvas.TextWidth(line1) > max_width)
      {
         line1 = FitText(line1, max_width, px);
         break;
      }
   }

   string remainder = "";
   for(int index = split_index; index < count; index++)
      remainder += (remainder == "" ? "" : " ") + words[index];

   if(remainder != "")
      line2 = FitText(remainder, max_width, px);
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

string ModeVi(const string value)
{
   if(value == "AUTO") return "TỰ ĐỘNG";
   if(value == "PAUSE") return "TẠM DỪNG";
   if(value == "TREND") return "bot Trend";
   if(value == "SIDEWAY") return "bot Sideway";
   if(EmptyValue(value)) return "CHƯA CÓ";
   return value;
}

string RegimeVi(const string value)
{
   if(value == "TREND") return "XU HƯỚNG";
   if(value == "SIDEWAY") return "ĐI NGANG";
   if(value == "REVERSAL") return "ĐẢO CHIỀU";
   if(value == "UNCERTAIN") return "CHƯA RÕ";
   if(EmptyValue(value)) return "CHƯA CÓ";
   return value;
}

string StageVi(const string value)
{
   if(value == "READY") return "SẴN SÀNG";
   if(value == "WAITING") return "ĐANG CHỜ";
   if(value == "BLOCKED") return "BỊ CHẶN";
   if(value == "MANAGING") return "ĐANG QUẢN LÝ";
   if(value == "OBSERVED") return "ĐANG THEO DÕI";
   if(value == "SUBMITTED") return "ĐÃ GỬI";
   if(value == "ERROR") return "LỖI";
   if(EmptyValue(value)) return "CHƯA CÓ";
   return value;
}

string SideVi(const string value)
{
   if(value == "BUY" || value == "LONG") return "MUA";
   if(value == "SELL" || value == "SHORT") return "BÁN";
   if(EmptyValue(value)) return "CHƯA CÓ";
   return value;
}

string ReasonVi(const string value, const string fallback="Chưa có dữ liệu")
{
   if(EmptyValue(value)) return fallback;
   string out = value;
   StringReplace(out, "A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xác nhận khả năng đảo chiều cấu trúc.");
   StringReplace(out, "Bollinger bandwidth is", "Độ rộng dải Bollinger là");
   StringReplace(out, "ENTRY_MODE_BLOCK: AUTO_REGIME_RECOMMENDS_PAUSE", "AUTO đang chờ trạng thái thị trường phù hợp.");
   StringReplace(out, "ENTRY_MODE_BLOCK: PAUSE_MODE_BLOCKS_NEW_ENTRY", "Chế độ TẠM DỪNG đang chặn lệnh mới.");
   StringReplace(out, "M15_NO_ENTRY_SIGNAL", "Khung M15 chưa có tín hiệu vào lệnh.");
   StringReplace(out, "WAIT_PULLBACK", "Đang chờ giá hồi về vùng phù hợp.");
   StringReplace(out, "PULLBACK_STILL_TOO_WIDE", "Vùng hồi vẫn quá rộng, chưa đủ điều kiện vào lệnh.");
   StringReplace(out, "PULLBACK_M5_ST_INVALIDATED", "Tín hiệu hồi giá khung M5 đã mất hiệu lực.");
   StringReplace(out, "CYCLE_ERROR: fetch failed", "Không lấy được dữ liệu trong chu kỳ kiểm tra.");
   StringReplace(out, "Regime", "Trạng thái thị trường");
   StringReplace(out, "recommended mode", "chế độ được khuyến nghị");
   StringReplace(out, "setup", "mẫu tín hiệu");
   StringReplace(out, "final gate", "điều kiện xác nhận cuối");
   return out;
}

void BeginPanel(const int width, const int height)
{
   g_canvas.Erase(A(C'3,10,18', 255));
   g_canvas.FillRectangle(0, 0, width - 1, height - 1, A(C'3,10,18', 255));
   g_canvas.Rectangle(0, 0, width - 1, height - 1, A(C'0,160,200'));
   g_canvas.FillRectangle(8, 6, width - 9, 8, A(C'0,210,255'));
}

void DrawHeader(const string payload, const int width, const string mode, const string strategy, const string regime, const string confidence)
{
   const int x = 10;
   const int y = 14;
   const int w = width - 20;
   const int h = 78;
   Card(x, y, w, h, C'7,20,30', C'0,72,102');

   string runtime_mode = Clean(Field(payload, "accountMode"), "CHECK");
   string local_mode = LocalAccountMode();
   color account_tone = RuntimeMatchesTerminal(payload) ? clrLimeGreen : clrTomato;

   Text(x + 14, y + 10, "XAUUSD AI MASTER", clrDeepSkyBlue, 12);
   TextRight(x + w - 14, y + 12, runtime_mode + " · CHỈ ĐỌC", account_tone, 8);
   Text(x + 14, y + 34, "Chế độ: " + ModeVi(mode), ModeTone(mode, strategy), 9);
   TextRight(x + w - 14, y + 34, "Đang áp dụng: " + ModeVi(strategy), ModeTone(mode, strategy), 8);
   Text(x + 14, y + 56, "Thị trường: " + RegimeVi(regime), RegimeTone(regime), 9);
   TextRight(x + w - 14, y + 56, "MT5 " + local_mode + " · Tin cậy " + Clean(confidence) + "%", account_tone, 8);
}

void DrawStatusItem(const int x, const int y, const string label, const bool on)
{
   color tone = on ? clrLimeGreen : clrTomato;
   g_canvas.FillCircle(x + 5, y + 7, 4, A(tone));
   Text(x + 16, y, label, clrSilver, 8);
   Text(x + 16, y + 18, on ? "ON" : "OFF", tone, 8);
}

void DrawSystemStatus(const string payload, const int width)
{
   const int x = 10;
   const int y = 100;
   const int w = width - 20;
   const int h = 62;
   Card(x, y, w, h, C'7,21,30', C'0,72,102');
   Text(x + 14, y + 8, "TRẠNG THÁI HỆ THỐNG", clrAqua, 9);

   int col = (w - 28) / 4;
   DrawStatusItem(x + 14, y + 30, "MT5", BoolField(payload, "mt5Connected") && RuntimeMatchesTerminal(payload));
   DrawStatusItem(x + 14 + col, y + 30, "An toàn", BoolField(payload, "accountGuardValid"));
   DrawStatusItem(x + 14 + col * 2, y + 30, "bot Trend", BoolField(payload, "trendOn"));
   DrawStatusItem(x + 14 + col * 3, y + 30, "bot Sideway", BoolField(payload, "sidewayOn"));
}

void DrawStateStrip(const string payload, const int width, const string title, const color tone)
{
   const int x = 10;
   const int y = 170;
   const int w = width - 20;
   const int h = 44;
   Card(x, y, w, h, C'9,24,34', tone);
   Text(x + 14, y + 8, title, tone, 9);
   TextRight(x + w - 14, y + 8, StageVi(Field(payload, "stage")), clrWhite, 8);
   Text(x + 14, y + 26, "Khuyến nghị: " + ModeVi(Field(payload, "recommendedMode")), clrSilver, 8);
}

void DrawReasonLine(const int x, const int y, const int max_width, const string label, const string reason, const color tone, const string fallback)
{
   Text(x, y, label, tone, 7);
   string line1, line2;
   WrapTextTwoLines(ReasonVi(reason, fallback), max_width - 112, 7, line1, line2);
   Text(x + 112, y, line1, clrWhite, 7);
   if(line2 != "")
      Text(x + 112, y + 13, line2, clrWhite, 7);
}

void DrawReasonSummary(const string payload, const int width, const int y, const string state)
{
   const int x = 10;
   const int w = width - 20;
   int h = state == "MANAGING" ? 176 : (state == "SETUP_READY" ? 104 : 84);
   Card(x, y, w, h, C'7,21,30', C'0,72,102');
   Text(x + 14, y + 8, "LÝ DO QUYẾT ĐỊNH", clrAqua, 9);
   int line_x = x + 18;
   int max_width = w - 36;
   int line_y = y + 31;

   if(state == "WAITING")
   {
      DrawReasonLine(line_x, line_y, max_width, "AUTO/REGIME", Field(payload, "autoReason1"), clrOrange, "AUTO chưa có dữ liệu chọn strategy.");
      DrawReasonLine(line_x, line_y + 28, max_width, "KẾT LUẬN", Field(payload, "waitReason1"), clrGold, "Bot đang chờ setup hợp lệ.");
   }
   else if(state == "SETUP_READY")
   {
      DrawReasonLine(line_x, line_y, max_width, "VÀO LỆNH", Field(payload, "entryReason1"), clrLimeGreen, "Setup đã được duyệt.");
      DrawReasonLine(line_x, line_y + 36, max_width, "AUTO/REGIME", Field(payload, "autoReason1"), clrOrange, "Không có dữ liệu AUTO/Regime.");
   }
   else
   {
      DrawReasonLine(line_x, line_y, max_width, "VÀO LỆNH", Field(payload, "entryReason1"), clrLimeGreen, "Không có dữ liệu lý do vào lệnh.");
      DrawReasonLine(line_x, line_y + 28, max_width, "GIỮ LỆNH", Field(payload, "holdReason1"), clrDeepSkyBlue, "Không có dữ liệu lý do giữ lệnh.");
      DrawReasonLine(line_x, line_y + 56, max_width, "DỜI SL", Field(payload, "stopMoveReason1"), clrLimeGreen, "Chưa phát sinh dời SL.");
      DrawReasonLine(line_x, line_y + 84, max_width, "CHỐT 1/3", Field(payload, "partialReason1"), clrAqua, "Chưa phát sinh partial.");
      DrawReasonLine(line_x, line_y + 112, max_width, "ĐÓNG TOÀN BỘ", Field(payload, "exitReason1"), clrGold, "Chưa phát sinh điều kiện đóng toàn bộ.");
   }
}

void DrawTradePlan(const string payload, const int width, const bool managing)
{
   const int x = 10;
   const int y = 170;
   const int w = width - 20;
   const int h = 76;
   Card(x, y, w, h, C'6,18,27', C'0,72,102');

   int gap = 6;
   int box_w = (w - 28 - gap * 2) / 3;
   int bx1 = x + 10;
   int bx2 = bx1 + box_w + gap;
   int bx3 = bx2 + box_w + gap;
   string entry = managing ? Field(payload, "positionEntry") : Field(payload, "setupEntry");
   string stop = managing ? Field(payload, "positionStopLoss") : Field(payload, "setupStopLoss");
   string tp2 = managing ? Field(payload, "positionTp2") : Field(payload, "setupTp2");
   string tp1 = managing ? Field(payload, "positionTp1") : Field(payload, "setupTp1");
   string strategy = managing ? Field(payload, "positionStrategy") : Field(payload, "setupStrategy");
   string tp = EmptyValue(tp2) ? tp1 : tp2;
   string tp_label = strategy == "TREND" && EmptyValue(tp2) ? "MỐC +10" : "TP";

   Card(bx1, y + 10, box_w, 56, C'7,25,38', C'0,110,155');
   Card(bx2, y + 10, box_w, 56, C'30,14,22', C'140,45,60');
   Card(bx3, y + 10, box_w, 56, C'12,28,20', C'45,140,70');
   Text(bx1 + 10, y + 18, "ENTRY", clrDeepSkyBlue, 7);
   Text(bx2 + 10, y + 18, "STOPLOSS", clrTomato, 7);
   Text(bx3 + 10, y + 18, tp_label, clrLimeGreen, 7);
   Text(bx1 + 10, y + 38, FitText(Clean(entry), box_w - 20, 9), clrWhite, 9);
   Text(bx2 + 10, y + 38, FitText(Clean(stop), box_w - 20, 9), clrWhite, 9);
   Text(bx3 + 10, y + 38, FitText(Clean(tp), box_w - 20, 9), clrWhite, 9);
}

color EntryCheckTone(const string status)
{
   if(status == "PASS") return clrLimeGreen;
   if(status == "FAIL" || status == "BLOCKED") return clrTomato;
   if(status == "WAIT") return clrGold;
   return clrSilver;
}

string EntryCheckStatusVi(const string status)
{
   if(status == "PASS") return "PASS";
   if(status == "FAIL") return "FAIL";
   if(status == "BLOCKED") return "BLOCK";
   if(status == "WAIT") return "WAIT";
   return "-";
}

string CompactEntryCheckLabel(const string value)
{
   string out = Clean(value, "Điều kiện entry");
   StringReplace(out, "Mode / Regime", "Mode/Regime");
   StringReplace(out, "Mode/ Regime", "Mode/Regime");
   StringReplace(out, "Mode /Regime", "Mode/Regime");
   return out;
}

string CompactEntryCheckText(const string status, const string label, const string actual)
{
   string compact = EntryCheckStatusVi(status) + " · " + CompactEntryCheckLabel(label);
   if(!EmptyValue(actual))
      compact += ": " + actual;
   return compact;
}

void FirstEntryBlocker(
   const string payload,
   const string prefix,
   string &label,
   string &status,
   string &actual
)
{
   label = "Chưa có dữ liệu";
   status = "WAIT";
   actual = "-";

   bool fallback_set = false;

   for(int index = 1; index <= 10; index++)
   {
      string suffix = IntegerToString(index);
      string candidate_status = Field(payload, prefix + "Check" + suffix + "Status");
      if(EmptyValue(candidate_status))
         continue;

      string candidate_label = Clean(
         Field(payload, prefix + "Check" + suffix + "Label"),
         "Điều kiện entry"
      );
      string candidate_actual = Clean(
         Field(payload, prefix + "Check" + suffix + "Actual"),
         "-"
      );

      if(!fallback_set)
      {
         label = candidate_label;
         status = candidate_status;
         actual = candidate_actual;
         fallback_set = true;
      }

      if(candidate_status != "PASS")
      {
         label = candidate_label;
         status = candidate_status;
         actual = candidate_actual;
         return;
      }
   }
}

void DrawEntryCheckSummary(const string payload, const int width, const int y)
{
   const int x = 10;
   const int w = width - 20;
   const int h = 96;

   Card(x, y, w, h, C'7,21,30', C'0,72,102');
   Text(x + 14, y + 8, "ĐIỀU KIỆN CHẶN ENTRY", clrAqua, 9);

   string trend_label, trend_status, trend_actual;
   string sideway_label, sideway_status, sideway_actual;

   FirstEntryBlocker(
      payload,
      "trend",
      trend_label,
      trend_status,
      trend_actual
   );

   FirstEntryBlocker(
      payload,
      "sideway",
      sideway_label,
      sideway_status,
      sideway_actual
   );

   Text(x + 14, y + 34, "TREND", clrDeepSkyBlue, 7);
   Text(
      x + 78,
      y + 34,
      FitText(
         CompactEntryCheckText(trend_status, trend_label, trend_actual),
         w - 98,
         7
      ),
      EntryCheckTone(trend_status),
      7
   );

   Text(x + 14, y + 62, "SIDEWAY", clrAqua, 7);
   Text(
      x + 78,
      y + 62,
      FitText(
         CompactEntryCheckText(sideway_status, sideway_label, sideway_actual),
         w - 98,
         7
      ),
      EntryCheckTone(sideway_status),
      7
   );
}

void DrawWaiting(const string payload, const int width)
{
   DrawStateStrip(payload, width, "BOT ĐANG CHỜ TÍN HIỆU", clrOrange);
   DrawEntryCheckSummary(payload, width, 222);
   DrawReasonSummary(payload, width, 326, "WAITING");
}

void DrawSetup(const string payload, const int width)
{
   DrawTradePlan(payload, width, false);
   DrawReasonSummary(payload, width, 254, "SETUP_READY");

   const int x = 10;
   const int w = width - 20;
   Card(x, 366, w, 48, C'7,21,30', C'0,72,102');
   Text(x + 14, 374, "Chiến lược: " + ModeVi(Field(payload, "setupStrategy")), clrWhite, 8);
   TextRight(x + w - 14, 374, "Hướng: " + SideVi(Field(payload, "setupSide")), clrWhite, 8);
   Text(x + 14, 394, "Lot: " + Clean(Field(payload, "setupFinalLot")), clrSilver, 8);
   TextRight(x + w - 14, 394, "Risk: " + Clean(Field(payload, "setupRiskPercent")) + "%", clrSilver, 8);
}

void DrawManaging(const string payload, const int width)
{
   DrawTradePlan(payload, width, true);

   const int x = 10;
   const int w = width - 20;
   Card(x, 254, w, 56, C'8,26,20', C'45,130,70');
   Text(x + 14, 264, "ĐANG GIỮ LỆNH", clrLimeGreen, 9);
   TextRight(x + w - 14, 264, "Lãi/lỗ: " + Clean(Field(payload, "floatingPnlUsd")) + " USD", clrWhite, 9);
   Text(x + 14, 286, "Hướng: " + SideVi(Field(payload, "positionSide")) + " · Lot: " + Clean(Field(payload, "positionVolume")), clrSilver, 8);
   TextRight(x + w - 14, 286, Clean(Field(payload, "floatingPnlPercent")) + "%", clrSilver, 8);

   DrawReasonSummary(payload, width, 318, "MANAGING");
}

void RenderPanel(const string payload)
{
   string ui_state = Clean(Field(payload, "uiState"), "WAITING");
   int height = ui_state == "MANAGING" ? MANAGING_HEIGHT : (ui_state == "SETUP_READY" ? SETUP_HEIGHT : WAITING_HEIGHT);
   int width = PanelWidth();
   if(!EnsureCanvas(width, height))
      return;

   BeginPanel(width, height);
   DrawHeader(payload, width,
      Field(payload, "activeMode"),
      Field(payload, "effectiveStrategy"),
      Field(payload, "regime"),
      Field(payload, "confidence"));
   DrawSystemStatus(payload, width);

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
   if(!EnsureCanvas(width, 230))
      return;
   BeginPanel(width, 230);
   Card(10, 14, width - 20, 202, C'12,18,26', C'180,60,60');
   Text(24, 28, "XAUUSD AI MASTER", clrDeepSkyBlue, 12);
   TextRight(width - 24, 30, LocalAccountMode() + " · CHỈ ĐỌC", clrSilver, 8);
   Text(24, 68, title, clrTomato, 10);
   Text(24, 98, FitText(message, width - 48, 8), clrWhite, 8);
   Text(24, 136, "Cho phép WebRequest tới http://127.0.0.1:3711", clrSilver, 8);
   Text(24, 160, "Kiểm tra API điều khiển và cầu nối MT5.", clrSilver, 8);
   TextCenter(width / 2, 194, "ORDER PERMISSION = NONE", clrSilver, 8);
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
      RenderError("KHÔNG GỌI ĐƯỢC API", "Lỗi WebRequest " + IntegerToString(GetLastError()));
      return;
   }
   if(status != 200)
   {
      RenderError("API CHƯA SẴN SÀNG", "Mã phản hồi " + IntegerToString(status));
      return;
   }

   string payload = CharArrayToString(response, 0, -1, CP_UTF8);
   if(Field(payload, "version") != "2")
   {
      RenderError("DỮ LIỆU GIAO DIỆN KHÔNG HỢP LỆ", "Phiên bản dữ liệu giao diện không phải 2");
      return;
   }
   if(!RuntimeMatchesTerminal(payload))
   {
      RenderError(
         "RUNTIME KHÔNG KHỚP TERMINAL",
         "Runtime " + Clean(Field(payload, "accountMode"), "CHECK") + " nhưng chart MT5 là " + LocalAccountMode() + ". Hãy dùng panel trên terminal account đang được chọn.");
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