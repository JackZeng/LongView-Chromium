(function installAdapters(global) {
  "use strict";

  const LV = global.LongView;
  const Core = global.LongViewCore;

  function uniqueTopLevel(nodes) {
    const unique = [...new Set(nodes)].filter((node) => node instanceof HTMLElement && node.isConnected);
    const set = new Set(unique);
    return unique.filter((node) => {
      let parent = node.parentElement;
      while (parent) {
        if (set.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }

  function firstSelectorWithEnoughMatches(selectors, minimum) {
    for (const selector of selectors) {
      const nodes = uniqueTopLevel([...document.querySelectorAll(selector)]);
      if (nodes.length >= minimum) return { selector, nodes };
    }
    return null;
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let candidate = nodes[0].parentElement;
    while (candidate) {
      if (nodes.every((node) => candidate.contains(node))) return candidate;
      candidate = candidate.parentElement;
    }
    return document.querySelector("main") || document.body;
  }

  const adapters = [
    {
      id: "chatgpt",
      matches: (hostname) => hostname === "chatgpt.com" || hostname === "chat.openai.com",
      discover(settings) {
        const result = firstSelectorWithEnoughMatches([
          'main article[data-testid^="conversation-turn-"]',
          'main [data-message-author-role]',
          'main article'
        ], settings.minimumSegments);
        if (!result) return null;
        return {
          adapterId: this.id,
          root: commonAncestor(result.nodes) || document.querySelector("main") || document.body,
          nodes: result.nodes,
          selector: result.selector,
          confidence: 1
        };
      }
    },
    {
      id: "claude",
      matches: (hostname) => hostname === "claude.ai",
      discover(settings) {
        const result = firstSelectorWithEnoughMatches([
          'main [data-testid*="message"]',
          'main [class*="font-user-message"], main [class*="font-claude-message"]',
          'main article'
        ], settings.minimumSegments);
        if (!result) return null;
        return {
          adapterId: this.id,
          root: commonAncestor(result.nodes) || document.querySelector("main") || document.body,
          nodes: result.nodes,
          selector: result.selector,
          confidence: 0.9
        };
      }
    },
    {
      id: "gemini",
      matches: (hostname) => hostname === "gemini.google.com",
      discover(settings) {
        const result = firstSelectorWithEnoughMatches([
          'main conversation-container',
          'main [data-test-id*="conversation"] > *',
          'main article'
        ], settings.minimumSegments);
        if (!result) return null;
        return {
          adapterId: this.id,
          root: commonAncestor(result.nodes) || document.querySelector("main") || document.body,
          nodes: result.nodes,
          selector: result.selector,
          confidence: 0.85
        };
      }
    }
  ];

  function elementSignature(element) {
    const classes = [...element.classList].slice(0, 4).sort().join(".");
    const role = element.getAttribute("role") || "";
    return `${element.tagName.toLowerCase()}|${role}|${classes}`;
  }

  function eligibleDirectChildren(container, settings) {
    const viewportWidth = Math.max(1, document.documentElement.clientWidth);
    const candidates = [];
    for (const child of container.children) {
      if (!(child instanceof HTMLElement)) continue;
      const rect = child.getBoundingClientRect();
      if (rect.height < settings.minimumSegmentHeight || rect.width < viewportWidth * 0.35) continue;
      const style = getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (style.position === "fixed" || style.position === "sticky") continue;
      candidates.push(child);
    }
    return candidates;
  }

  function genericDiscover(settings) {
    const viewportHeight = Math.max(1, innerHeight);
    const containers = [...new Set([
      ...document.querySelectorAll("main, [role=main], article, section, ol, ul"),
      document.body
    ])].filter((node) => node instanceof HTMLElement && node.isConnected).slice(0, 240);

    let best = null;
    for (const container of containers) {
      const children = eligibleDirectChildren(container, settings);
      if (children.length < settings.minimumSegments) continue;

      const heights = children.map((node) => node.getBoundingClientRect().height);
      const signatures = new Map();
      for (const child of children) {
        const signature = elementSignature(child);
        signatures.set(signature, (signatures.get(signature) || 0) + 1);
      }
      const dominantCount = Math.max(...signatures.values());
      const dominantRatio = dominantCount / children.length;
      const firstRect = children[0].getBoundingClientRect();
      const lastRect = children.at(-1).getBoundingClientRect();
      const totalHeight = Math.max(0, lastRect.bottom - firstRect.top);
      const medianHeight = Core.median(heights);
      const score = Core.scoreCandidateContainer({
        childCount: children.length,
        totalHeight,
        viewportHeight,
        dominantRatio,
        medianHeight
      });
      if (!best || score > best.score) {
        best = { container, children, score, dominantRatio, medianHeight };
      }
    }

    if (!best || best.score < 10) return null;
    return {
      adapterId: "generic",
      root: best.container,
      nodes: best.children,
      selector: null,
      confidence: Math.min(0.8, 0.35 + best.dominantRatio),
      score: best.score
    };
  }

  function discover(settings) {
    const hostname = location.hostname.toLowerCase();
    for (const adapter of adapters) {
      if (!adapter.matches(hostname)) continue;
      const result = adapter.discover(settings);
      if (result) return result;
    }
    return genericDiscover(settings);
  }

  LV.adapters = { discover, genericDiscover, adapters };
})(globalThis);
