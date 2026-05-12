import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, FileText, CheckCircle, XCircle, AlertTriangle,
  Loader2, Trash2, Download, ClipboardList, Search, Image, Languages, Eye
} from "lucide-react";

// ============================================================
// Constants
// ============================================================

const CATEGORIES = [
  {
    id: "community",
    name: "社区通用素材发布",
    icon: "📢",
    description: "社区通用活动/攻略素材检查",
    checks: [
      { id: "en_accurate", label: "EN图片是否准确", category: "image", desc: "检查英文版本图片内容是否与需求文档一致" },
      { id: "ru_accurate", label: "RU图片是否准确", category: "image", desc: "检查俄文版本图片内容是否与需求文档一致" },
      { id: "hero_accurate", label: "英雄头像/神器/关卡名称是否准确", category: "content", desc: "OCR提取图片中英雄、神器、关卡等关键名称与需求比对" },
      { id: "author_accurate", label: "攻略提供人姓名是否准确", category: "content", desc: "检查攻略作者姓名是否与需求中指定的一致" },
    ],
  },
  {
    id: "cdk",
    name: "携带CDK奖励类素材发布",
    icon: "🎁",
    description: "CDK兑换码相关素材检查",
    checks: [
      { id: "cdk_image_match", label: "图片内CDK是否与贴文内一致", category: "cdk", desc: "OCR提取图片中CDK码与需求文本中CDK码比对" },
      { id: "cdk_redeem", label: "CDK是否正常兑换", category: "manual", desc: "需人工验证CDK兑换是否成功" },
      { id: "cdk_validity", label: "CDK有效期是否一致", category: "date", desc: "检查图片与需求中有效期是否匹配" },
    ],
  },
  {
    id: "announcement",
    name: "公告类素材发布",
    icon: "📣",
    description: "游戏公告相关素材检查",
    checks: [
      { id: "time_accurate", label: "图片内时间是否与实际一致", category: "date", desc: "OCR提取图片中时间/日期信息与需求比对" },
      { id: "en_correct", label: "公告EN图片是否正确", category: "image", desc: "检查英文公告图片内容准确性" },
      { id: "ru_correct", label: "公告RU图片是否正确", category: "image", desc: "检查俄文公告图片内容准确性" },
    ],
  },
  {
    id: "internal",
    name: "内宣素材传递",
    icon: "📋",
    description: "内部宣传素材检查",
    checks: [
      { id: "text_correct", label: "图片内文案是否正确", category: "content", desc: "OCR提取图片文案与需求比对" },
      { id: "lang_filename", label: "EN,RU,DE,FR四语是否与文件名一致", category: "filename", desc: "检查各语言版本文件名与实际内容语言是否匹配" },
      { id: "platform_match", label: "跳转平台是否一致", category: "manual", desc: "需人工确认跳转链接指向平台是否正确" },
      { id: "reward_icon_match", label: "奖励ICON与实际奖励是否一致", category: "manual", desc: "需人工比对图标与实际奖励道具" },
      { id: "reward_icon_bg", label: "奖励ICON背景颜色是否一致", category: "manual", desc: "需人工确认各奖励图标背景颜色统一" },
    ],
  },
];

const LANGUAGE_CODES = ["EN", "RU", "DE", "FR", "ZH", "JA", "KO", "ES", "PT", "IT"];

// ============================================================
// Helper Functions
// ============================================================

function extractDates(text) {
  if (!text) return [];
  const patterns = [
    /\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/g,
    /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/g,
    /\d{4}年\d{1,2}月\d{1,2}日/g,
    /\d{1,2}月\d{1,2}日/g,
    /\d{1,2}\.\d{1,2}\.\d{4}/g,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi,
    /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/gi,
  ];
  return [...new Set(patterns.flatMap((p) => text.match(p) || []))];
}

function extractCDKs(text) {
  if (!text) return [];
  const patterns = [
    /[A-Z0-9]{4,}-[A-Z0-9]{4,}-[A-Z0-9]{4,}/gi,
    /[A-Z0-9]{8,}/g,
    /CDK[:\s]*([A-Z0-9\-]+)/gi,
    /兑换码[:\s]*([A-Z0-9\-]+)/gi,
  ];
  const results = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    results.push(...matches.map((m) => m.replace(/CDK[:\s]*/i, "").replace(/兑换码[:\s]*/i, "").trim()));
  }
  return [...new Set(results.filter((c) => c.length >= 4))];
}

function extractLanguageFromFilename(filename) {
  const upper = filename.toUpperCase();
  for (const code of LANGUAGE_CODES) {
    const patterns = [
      new RegExp(`[_\-\\.]${code}[_\-\\.]`, "i"),
      new RegExp(`[_\-\\.]${code}$`, "i"),
      new RegExp(`^${code}[_\-\\.]`, "i"),
      new RegExp(`\\(${code}\\)`, "i"),
      new RegExp(`\\[${code}\\]`, "i"),
    ];
    for (const p of patterns) {
      if (p.test(upper)) return code;
    }
  }
  return null;
}

function calculateTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  const normalize = (t) =>
    t
      .toLowerCase()
      .replace(/[^\w\s一-鿿]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const t1 = normalize(text1);
  const t2 = normalize(text2);
  if (!t1 || !t2) return 0;

  const words1 = new Set(t1.split(" ").filter((w) => w.length > 1));
  const words2 = new Set(t2.split(" ").filter((w) => w.length > 1));
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

function findKeyPhrases(text, phrases) {
  if (!text || !phrases.length) return { found: [], missing: phrases };
  const lower = text.toLowerCase();
  const found = [];
  const missing = [];
  for (const phrase of phrases) {
    if (lower.includes(phrase.toLowerCase())) {
      found.push(phrase);
    } else {
      missing.push(phrase);
    }
  }
  return { found, missing };
}

function normalizeDate(d) {
  return d.replace(/[年月]/g, "-").replace(/[日号]/g, "").replace(/\./g, "-").trim();
}

function loadTesseractScript() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract);
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/dist/tesseract.min.js";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Tesseract.js 加载失败"));
    document.head.appendChild(script);
  });
}

async function runOCR(imageUrl, lang = "eng+chi_sim") {
  const Tesseract = await loadTesseractScript();
  const result = await Tesseract.recognize(imageUrl, lang);
  return result.data.text || "";
}

// ============================================================
// Sub-components
// ============================================================

function CategoryCard({ category, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(category.id)}
      className={`relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
        ${selected
          ? "border-blue-500 bg-blue-50 shadow-md"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
        }`}
    >
      <span className="text-2xl mb-2">{category.icon}</span>
      <span className={`text-sm font-semibold text-center ${selected ? "text-blue-700" : "text-gray-700"}`}>
        {category.name}
      </span>
      <span className="text-xs text-gray-400 mt-1 text-center">{category.description}</span>
    </button>
  );
}

function CheckItem({ check, result, details }) {
  const statusConfig = {
    pass: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50", border: "border-green-200", label: "通过" },
    fail: { icon: XCircle, color: "text-red-500", bg: "bg-red-50", border: "border-red-200", label: "未通过" },
    warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-50", border: "border-yellow-200", label: "需确认" },
    pending: { icon: Loader2, color: "text-gray-400", bg: "bg-gray-50", border: "border-gray-200", label: "待检查" },
    manual: { icon: Eye, color: "text-purple-500", bg: "bg-purple-50", border: "border-purple-200", label: "人工核实" },
  };

  const config = statusConfig[result || "pending"];
  const Icon = config.icon;

  return (
    <div className={`p-4 rounded-lg border ${config.border} ${config.bg} mb-3`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.color} ${result === "pending" ? "animate-spin" : ""}`} />
          <div>
            <div className="font-medium text-gray-800 text-sm">{check.label}</div>
            <div className="text-xs text-gray-500 mt-1">{check.desc}</div>
            {details && (
              <div className="mt-2 text-xs bg-white rounded p-2 border border-gray-100">
                {details}
              </div>
            )}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.color} border ${config.border}`}>
          {config.label}
        </span>
      </div>
    </div>
  );
}

function ImagePreview({ image, index, onRemove, ocrText, ocrLoading, onOcrTextChange, onRunOcr }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-start space-x-3">
        <div className="relative group flex-shrink-0">
          <img
            src={image.preview}
            alt={image.name}
            className="w-24 h-24 object-cover rounded-lg border border-gray-100"
          />
          <button
            onClick={() => onRemove(index)}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-700 truncate">{image.name}</div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              {image.lang && <span className="inline-block bg-blue-100 text-blue-600 text-xs px-1.5 py-0.5 rounded">{image.lang}</span>}
              {!ocrLoading && !ocrText && (
                <button
                  onClick={() => onRunOcr(index)}
                  className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 transition-colors"
                >
                  <Search className="w-3 h-3 inline mr-0.5" />
                  识别文字
                </button>
              )}
            </div>
          </div>
          {ocrLoading && (
            <div className="flex items-center space-x-1 mt-2 text-xs text-blue-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>OCR识别中...</span>
            </div>
          )}
          <textarea
            className="mt-2 w-full text-xs border border-gray-200 rounded p-2 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none resize-none"
            rows={2}
            placeholder="点击「识别文字」自动提取，也可手动输入或粘贴..."
            value={ocrText || ""}
            onChange={(e) => onOcrTextChange(index, e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main App Component
// ============================================================

export default function MaterialQAChecker() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [images, setImages] = useState([]);
  const [requirementText, setRequirementText] = useState("");
  const [checkResults, setCheckResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState({});
  const [step, setStep] = useState(1);
  const fileInputRef = useRef(null);

  const category = CATEGORIES.find((c) => c.id === selectedCategory);

  // ---- Image handling ----
  const handleFiles = useCallback((files) => {
    const fileList = Array.from(files);
    const newImages = fileList.map((file) => ({
      file,
      name: file.name,
      preview: URL.createObjectURL(file),
      lang: extractLanguageFromFilename(file.name),
      ocrText: "",
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  // Keep a ref in sync with images so OCR can always get the latest preview URL
  const imagesRef = useRef(images);
  useEffect(() => { imagesRef.current = images; }, [images]);

  const runOcrForImage = async (index) => {
    const previewUrl = imagesRef.current[index]?.preview;
    if (!previewUrl) return;
    setOcrLoading((prev) => ({ ...prev, [index]: true }));
    try {
      const text = await runOCR(previewUrl);
      setImages((prev) => {
        const updated = [...prev];
        if (updated[index]) updated[index] = { ...updated[index], ocrText: text };
        return updated;
      });
    } catch (err) {
      console.error("OCR failed:", err);
      setImages((prev) => {
        const updated = [...prev];
        if (updated[index]) updated[index] = { ...updated[index], ocrText: "[OCR识别失败，请手动输入或粘贴文字]" };
        return updated;
      });
    } finally {
      setOcrLoading((prev) => ({ ...prev, [index]: false }));
    }
  };

  const runAllOcr = async () => {
    for (let i = 0; i < images.length; i++) {
      if (!images[i].ocrText) {
        await runOcrForImage(i);
      }
    }
  };

  const handleOcrTextChange = (index, text) => {
    setImages((prev) => {
      const updated = [...prev];
      if (updated[index]) updated[index] = { ...updated[index], ocrText: text };
      return updated;
    });
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setOcrLoading((prev) => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // ---- Check execution ----
  const runChecks = async () => {
    setIsProcessing(true);
    setCheckResults(null);

    const allOcrText = images.map((img) => img.ocrText || "").join("\n---\n");
    const reqText = requirementText;
    const ocrDates = extractDates(allOcrText);
    const reqDates = extractDates(reqText);
    const ocrCDKs = extractCDKs(allOcrText);
    const reqCDKs = extractCDKs(reqText);

    // Wait a tick for UI to update
    await new Promise((r) => setTimeout(r, 100));

    const results = {};

    for (const check of category.checks) {
      let status = "pending";
      let details = "";

      switch (check.id) {
        // ---- Community ----
        case "en_accurate": {
          const enImages = images.filter((img) => img.lang === "EN");
          if (enImages.length === 0) {
            status = "warning";
            details = "未检测到EN语言标识的图片，请确认是否已上传英文版本";
          } else {
            const similarities = enImages.map((img) => calculateTextSimilarity(img.ocrText, reqText));
            const avgSim = similarities.reduce((a, b) => a + b, 0) / similarities.length;
            if (avgSim > 0.3) status = "pass";
            else if (avgSim > 0.1) status = "warning";
            else status = "fail";
            details = `EN图片文字匹配度: ${Math.round(avgSim * 100)}%。匹配度较低时请人工核实图片内容。`;
          }
          break;
        }
        case "ru_accurate": {
          const ruImages = images.filter((img) => img.lang === "RU");
          if (ruImages.length === 0) {
            status = "warning";
            details = "未检测到RU语言标识的图片，请确认是否已上传俄文版本";
          } else {
            const similarities = ruImages.map((img) => calculateTextSimilarity(img.ocrText, reqText));
            const avgSim = similarities.reduce((a, b) => a + b, 0) / similarities.length;
            if (avgSim > 0.2) status = "pass";
            else if (avgSim > 0.05) status = "warning";
            else status = "fail";
            details = `RU图片文字匹配度: ${Math.round(avgSim * 100)}%。俄文OCR准确率较低，建议人工核实。`;
          }
          break;
        }
        case "hero_accurate": {
          const heroKeywords = extractHeroKeywords(reqText);
          const { found, missing } = findKeyPhrases(allOcrText, heroKeywords);
          if (missing.length === 0 && found.length > 0) {
            status = "pass";
            details = `已匹配关键词: ${found.join("、")}`;
          } else if (found.length > 0) {
            status = "warning";
            details = `已匹配: ${found.join("、")}；未找到: ${missing.join("、")}`;
          } else {
            status = "warning";
            details = "未能从图片中识别到相关关键词，请人工核实。可尝试手动编辑OCR结果。";
          }
          break;
        }
        case "author_accurate": {
          const authorRegex = /(?:提供|作者|攻略|Author|Guide\s*by|Created\s*by)[:：]?\s*([A-Za-z一-鿿0-9_\-]+)/gi;
          const reqAuthors = [];
          let m;
          while ((m = authorRegex.exec(reqText)) !== null) {
            reqAuthors.push(m[1].trim());
          }
          const ocrAuthors = [];
          while ((m = authorRegex.exec(allOcrText)) !== null) {
            ocrAuthors.push(m[1].trim());
          }
          if (reqAuthors.length === 0) {
            status = "warning";
            details = "需求文本中未检测到作者姓名信息，请人工确认。";
          } else if (ocrAuthors.some((a) => reqAuthors.some((ra) => ra.includes(a) || a.includes(ra)))) {
            status = "pass";
            details = `需求作者: ${reqAuthors.join("、")}；图片中检测到匹配的作者名。`;
          } else {
            status = "warning";
            details = `需求作者: ${reqAuthors.join("、")}；图片中未明确匹配，请人工核实。`;
          }
          break;
        }

        // ---- CDK ----
        case "cdk_image_match": {
          if (reqCDKs.length === 0) {
            status = "warning";
            details = "需求文本中未检测到CDK码，请手动输入CDK码到需求文本中";
          } else if (ocrCDKs.length === 0) {
            status = "fail";
            details = "图片中未检测到CDK码。请检查图片是否包含CDK，或手动编辑OCR结果。";
          } else {
            const matched = ocrCDKs.filter((oc) => reqCDKs.some((rc) => rc.toUpperCase() === oc.toUpperCase()));
            if (matched.length === reqCDKs.length) {
              status = "pass";
              details = `CDK匹配成功: ${matched.join("、")}`;
            } else if (matched.length > 0) {
              status = "warning";
              details = `部分匹配: ${matched.join("、")}。图片CDK: ${ocrCDKs.join("、")}；需求CDK: ${reqCDKs.join("、")}`;
            } else {
              status = "fail";
              details = `CDK不匹配！图片CDK: ${ocrCDKs.join("、")}；需求CDK: ${reqCDKs.join("、")}`;
            }
          }
          break;
        }
        case "cdk_redeem":
          status = "manual";
          details = "CDK兑换验证需要实际操作游戏内兑换入口进行确认，请人工完成此步骤。";
          break;
        case "cdk_validity": {
          if (ocrDates.length === 0 && reqDates.length === 0) {
            status = "warning";
            details = "未能从图片或需求中检测到日期信息。";
          } else if (reqDates.length === 0) {
            status = "warning";
            details = `图片中检测到日期: ${ocrDates.join("、")}，但需求文本中未发现日期，请补充。`;
          } else if (ocrDates.length === 0) {
            status = "fail";
            details = `需求日期: ${reqDates.join("、")}，图片中未检测到日期信息。`;
          } else {
            const nOcr = ocrDates.map(normalizeDate);
            const nReq = reqDates.map(normalizeDate);
            const match = nReq.some((rd) => nOcr.some((od) => od.includes(rd) || rd.includes(od)));
            status = match ? "pass" : "warning";
            details = match
              ? `日期一致：图片: ${ocrDates.join("、")} ↔ 需求: ${reqDates.join("、")}`
              : `日期可能不一致：图片: ${ocrDates.join("、")} vs 需求: ${reqDates.join("、")}，请人工确认。`;
          }
          break;
        }

        // ---- Announcement ----
        case "time_accurate": {
          if (ocrDates.length === 0) {
            status = "fail";
            details = "图片中未检测到时间/日期信息。请检查图片清晰度或手动编辑OCR结果。";
          } else if (reqDates.length === 0) {
            status = "warning";
            details = `图片中检测到: ${ocrDates.join("、")}，需求文本中未发现日期信息，请补充需求。`;
          } else {
            const nOcr = ocrDates.map(normalizeDate);
            const nReq = reqDates.map(normalizeDate);
            const match = nReq.some((rd) => nOcr.some((od) => od.includes(rd) || rd.includes(od)));
            status = match ? "pass" : "fail";
            details = match
              ? `时间一致：图片: ${ocrDates.join("、")} ↔ 需求: ${reqDates.join("、")}`
              : `时间不一致！图片: ${ocrDates.join("、")} vs 需求: ${reqDates.join("、")}`;
          }
          break;
        }
        case "en_correct": {
          const enImgs = images.filter((img) => img.lang === "EN");
          if (enImgs.length === 0) {
            status = "warning";
            details = "未检测到EN语言标识的图片";
          } else {
            const sims = enImgs.map((img) => calculateTextSimilarity(img.ocrText, reqText));
            const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
            status = avg > 0.3 ? "pass" : avg > 0.1 ? "warning" : "fail";
            details = `EN公告图片文字匹配度: ${Math.round(avg * 100)}%。`;
          }
          break;
        }
        case "ru_correct": {
          const ruImgs = images.filter((img) => img.lang === "RU");
          if (ruImgs.length === 0) {
            status = "warning";
            details = "未检测到RU语言标识的图片";
          } else {
            const sims = ruImgs.map((img) => calculateTextSimilarity(img.ocrText, reqText));
            const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
            status = avg > 0.2 ? "pass" : avg > 0.05 ? "warning" : "fail";
            details = `RU公告图片文字匹配度: ${Math.round(avg * 100)}%。`;
          }
          break;
        }

        // ---- Internal ----
        case "text_correct": {
          if (!allOcrText.trim()) {
            status = "warning";
            details = "图片OCR结果为空，请等待OCR完成或手动输入文字。";
          } else {
            const sim = calculateTextSimilarity(allOcrText, reqText);
            if (sim > 0.4) status = "pass";
            else if (sim > 0.15) status = "warning";
            else status = "fail";
            details = `图片文案与需求匹配度: ${Math.round(sim * 100)}%。匹配度低时请人工逐句核对。`;
          }
          break;
        }
        case "lang_filename": {
          const requiredLangs = ["EN", "RU", "DE", "FR"];
          const imgLangs = images.map((img) => img.lang).filter(Boolean);
          const missingLangs = requiredLangs.filter((l) => !imgLangs.includes(l));
          const extraLangs = imgLangs.filter((l) => !requiredLangs.includes(l));
          if (missingLangs.length === 0 && extraLangs.length === 0) {
            status = "pass";
            details = `四语文件齐全: ${imgLangs.join("、")}，均与文件名标识一致。`;
          } else if (missingLangs.length > 0) {
            status = "fail";
            details = `缺少语种文件: ${missingLangs.join("、")}。已检测: ${imgLangs.join("、") || "无"}。`;
          } else {
            status = "warning";
            details = `多出语种: ${extraLangs.join("、")}。已检测: ${imgLangs.join("、")}。请确认是否全部需要。`;
          }
          break;
        }
        case "platform_match":
          status = "manual";
          details = "请人工检查图片中跳转链接/二维码指向的平台是否与需求一致。";
          break;
        case "reward_icon_match":
          status = "manual";
          details = "请人工比对图片中的奖励图标是否与需求文档中描述的奖励道具一致。";
          break;
        case "reward_icon_bg":
          status = "manual";
          details = "请人工确认各奖励图标的背景颜色是否统一（如：紫色=史诗、金色=传说等）。";
          break;

        default:
          status = "pending";
          details = "";
      }

      results[check.id] = { status, details };
    }

    setCheckResults(results);
    setIsProcessing(false);
    setStep(4);
  };

  // ---- Export ----
  const exportResults = () => {
    if (!checkResults) return;
    const lines = [
      `物料质量检查报告`,
      `类别: ${category.name}`,
      `检查时间: ${new Date().toLocaleString()}`,
      `上传图片: ${images.length} 张`,
      `---`,
    ];
    let passCount = 0, failCount = 0, warnCount = 0, manualCount = 0;
    for (const check of category.checks) {
      const r = checkResults[check.id] || { status: "pending", details: "" };
      const label = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : r.status === "warning" ? "⚠️" : r.status === "manual" ? "👁️" : "⏳";
      lines.push(`${label} ${check.label}`);
      if (r.details) lines.push(`   详情: ${r.details}`);
      if (r.status === "pass") passCount++;
      else if (r.status === "fail") failCount++;
      else if (r.status === "warning") warnCount++;
      else if (r.status === "manual") manualCount++;
    }
    lines.push(`---`);
    lines.push(`通过: ${passCount} | 未通过: ${failCount} | 需确认: ${warnCount} | 人工核实: ${manualCount}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QA检查报告_${category.id}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setSelectedCategory(null);
    setImages([]);
    setRequirementText("");
    setCheckResults(null);
    setOcrLoading({});
    setStep(1);
  };

  // ---- Derived values ----
  const passCount = checkResults
    ? Object.values(checkResults).filter((r) => r.status === "pass").length
    : 0;
  const failCount = checkResults
    ? Object.values(checkResults).filter((r) => r.status === "fail").length
    : 0;
  const warnCount = checkResults
    ? Object.values(checkResults).filter((r) => r.status === "warning").length
    : 0;
  const manualCount = checkResults
    ? Object.values(checkResults).filter((r) => r.status === "manual").length
    : 0;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                <ClipboardList className="w-6 h-6 text-blue-500" />
                <span>物料质量检查系统</span>
              </h1>
              <p className="text-sm text-gray-500 mt-1">上传美术物料和需求文本，自动检查内容一致性</p>
            </div>
            {step > 1 && (
              <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700 underline">
                重新开始
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Step indicator */}
        <div className="flex items-center justify-center mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                  ${step >= s ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-500"}`}
              >
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              {s < 4 && (
                <div className={`w-16 h-0.5 mx-2 ${step > s ? "bg-blue-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
          <div className="ml-4 text-xs text-gray-400">
            {["选择类别", "上传素材", "输入需求", "查看结果"][step - 1]}
          </div>
        </div>

        {/* Step 1: Category Selection */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">选择物料类别</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {CATEGORIES.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  selected={selectedCategory === cat.id}
                  onClick={(id) => {
                    setSelectedCategory(id);
                    setStep(2);
                  }}
                />
              ))}
            </div>
            {selectedCategory && category && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-semibold text-blue-800 mb-2">已选择: {category.name}</div>
                <div className="text-xs text-blue-600">
                  将检查以下 {category.checks.length} 项：
                  {category.checks.map((c) => c.label).join("、")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Upload Images */}
        {step === 2 && category && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                上传待检查物料 <span className="text-sm font-normal text-gray-400">({category.name})</span>
              </h2>
              <button
                onClick={() => setStep(3)}
                disabled={images.length === 0}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${images.length > 0
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
              >
                下一步：输入需求
              </button>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors mb-4"
            >
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">拖拽图片到此处，或点击上传</p>
              <p className="text-gray-400 text-xs mt-1">支持 PNG、JPG、GIF、WebP 格式，可多选</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {/* Image list */}
            {images.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm text-gray-500">
                  <div className="flex items-center justify-between">
                    <div>
                      已上传 {images.length} 张图片
                      <span className="text-xs text-gray-400 ml-2">(点击「识别文字」提取图片中文字)</span>
                    </div>
                    <button
                      onClick={runAllOcr}
                      disabled={Object.values(ocrLoading).some(Boolean)}
                      className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-3 py-1 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Languages className="w-3 h-3 inline mr-1" />
                      全部识别
                    </button>
                  </div>
                </div>
                {images.map((img, i) => (
                  <ImagePreview
                    key={i}
                    image={img}
                    index={i}
                    onRemove={removeImage}
                    ocrText={img.ocrText}
                    ocrLoading={ocrLoading[i]}
                    onOcrTextChange={handleOcrTextChange}
                    onRunOcr={runOcrForImage}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Requirement Text */}
        {step === 3 && category && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">输入需求文本</h2>
              <button
                onClick={() => setStep(2)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                返回上一步
              </button>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">
                请粘贴或输入对应物料的需求文本（可包含活动名称、时间、CDK码、作者名等关键信息）
              </div>
              <textarea
                value={requirementText}
                onChange={(e) => setRequirementText(e.target.value)}
                placeholder={`请输入需求文本，例如：\n活动名称：XXX\n活动时间：2024/01/15 - 2024/01/30\n兑换码：ABCD-1234-EFGH\n作者：张三\n...`}
                rows={8}
                className="w-full border border-gray-300 rounded-lg p-4 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none resize-y"
              />
            </div>

            {/* Image summary */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-700 mb-2">
                已上传 {images.length} 张图片
              </div>
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <span key={i} className="inline-flex items-center space-x-1 text-xs bg-white border border-gray-200 rounded px-2 py-1">
                    <Image className="w-3 h-3 text-gray-400" />
                    <span className="truncate max-w-[150px]">{img.name}</span>
                    {img.lang && <span className="text-blue-500 font-medium">[{img.lang}]</span>}
                    {ocrLoading[i] && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={runChecks}
              disabled={isProcessing || !requirementText.trim()}
              className={`w-full py-3 rounded-lg font-medium text-sm transition-colors
                ${isProcessing || !requirementText.trim()
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在检查中...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center space-x-2">
                  <Search className="w-4 h-4" />
                  <span>开始检查</span>
                </span>
              )}
            </button>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && checkResults && category && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">检查结果</h2>
              <div className="flex items-center space-x-3">
                <button
                  onClick={exportResults}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>导出报告</span>
                </button>
                <button
                  onClick={() => { setStep(3); setCheckResults(null); }}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  重新检查
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{passCount}</div>
                <div className="text-xs text-green-500">通过</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{failCount}</div>
                <div className="text-xs text-red-500">未通过</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-600">{warnCount}</div>
                <div className="text-xs text-yellow-500">需确认</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-600">{manualCount}</div>
                <div className="text-xs text-purple-500">人工核实</div>
              </div>
            </div>

            {/* Check items */}
            <div className="mb-6">
              {category.checks.map((check) => (
                <CheckItem
                  key={check.id}
                  check={check}
                  result={checkResults[check.id]?.status}
                  details={checkResults[check.id]?.details}
                />
              ))}
            </div>

            {/* Overall verdict */}
            <div className={`p-4 rounded-lg border ${failCount > 0 ? "bg-red-50 border-red-300" : warnCount > 0 ? "bg-yellow-50 border-yellow-300" : "bg-green-50 border-green-300"}`}>
              <div className="flex items-center space-x-2">
                {failCount > 0 ? (
                  <>
                    <XCircle className="w-5 h-5 text-red-500" />
                    <span className="font-semibold text-red-700">发现 {failCount} 项未通过，请修正后重新检查</span>
                  </>
                ) : warnCount > 0 || manualCount > 0 ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <span className="font-semibold text-yellow-700">
                      所有自动检查项已通过，还有 {warnCount + manualCount} 项需要人工确认
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="font-semibold text-green-700">所有检查项均已通过！</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helpers used in check logic
// ============================================================

function extractHeroKeywords(text) {
  if (!text) return [];
  const patterns = [
    /(?:英雄|角色|Hero|Champion)[:：\s]*([A-Za-z一-鿿]+)/gi,
    /(?:神器|Artifact|Relic)[:：\s]*([A-Za-z一-鿿]+)/gi,
    /(?:关卡|Stage|Level)[:：\s]*([A-Za-z0-9一-鿿\-]+)/gi,
  ];
  const keywords = [];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(text)) !== null) {
      keywords.push(m[1].trim());
    }
  }
  if (keywords.length === 0) {
    // Fallback: extract capitalized words and Chinese names as potential keywords
    const words = text.match(/[A-Z][a-z]{2,}|[一-鿿]{2,4}/g) || [];
    return [...new Set(words)].slice(0, 10);
  }
  return [...new Set(keywords)];
}
