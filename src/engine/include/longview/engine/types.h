#pragma once

#include <cstdint>
#include <string_view>

namespace longview::engine {

enum class SegmentState : std::uint8_t {
  kHot,
  kWarm,
  kCold,
  kPinned,
};

enum class MaterializationReason : std::uint8_t {
  kViewportApproach,
  kGeometryQuery,
  kFindInPage,
  kFocus,
  kSelection,
  kAnchorNavigation,
  kAccessibility,
  kScreenshot,
  kPrint,
  kScriptMutation,
};

enum class WorkPriority : std::uint8_t {
  kInputCritical,
  kRasterSoon,
  kNormal,
  kBackground,
  kSuspended,
};

constexpr std::string_view ToString(SegmentState state) {
  switch (state) {
    case SegmentState::kHot: return "hot";
    case SegmentState::kWarm: return "warm";
    case SegmentState::kCold: return "cold";
    case SegmentState::kPinned: return "pinned";
  }
  return "unknown";
}

constexpr std::string_view ToString(MaterializationReason reason) {
  switch (reason) {
    case MaterializationReason::kViewportApproach: return "viewport-approach";
    case MaterializationReason::kGeometryQuery: return "geometry-query";
    case MaterializationReason::kFindInPage: return "find-in-page";
    case MaterializationReason::kFocus: return "focus";
    case MaterializationReason::kSelection: return "selection";
    case MaterializationReason::kAnchorNavigation: return "anchor-navigation";
    case MaterializationReason::kAccessibility: return "accessibility";
    case MaterializationReason::kScreenshot: return "screenshot";
    case MaterializationReason::kPrint: return "print";
    case MaterializationReason::kScriptMutation: return "script-mutation";
  }
  return "unknown";
}

constexpr std::string_view ToString(WorkPriority priority) {
  switch (priority) {
    case WorkPriority::kInputCritical: return "input-critical";
    case WorkPriority::kRasterSoon: return "raster-soon";
    case WorkPriority::kNormal: return "normal";
    case WorkPriority::kBackground: return "background";
    case WorkPriority::kSuspended: return "suspended";
  }
  return "unknown";
}

}  // namespace longview::engine
