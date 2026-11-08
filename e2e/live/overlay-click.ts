import type { Page } from '@playwright/test';

interface CdpNode {
  nodeId?: number;
  backendNodeId?: number;
  nodeName?: string;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
}

const HOST = '#pg-review-overlay-host';

/**
 * Test helper: click the n-th element with a CSS class inside the review's
 * closed shadow DOM. Restricted to the review's own host, like the other
 * closed-shadow helper, so it cannot reach into the page.
 */
export async function clickOverlayElement(page: Page, className: string, index = 0): Promise<void> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('DOM.enable');
    const { root } = (await client.send('DOM.getDocument', { depth: 0 })) as { root: CdpNode };
    const { nodeId } = (await client.send('DOM.querySelector', { nodeId: root.nodeId!, selector: HOST })) as {
      nodeId: number;
    };
    if (!nodeId) throw new Error(`${HOST} was not found`);
    const { node } = (await client.send('DOM.describeNode', { nodeId, depth: -1, pierce: true })) as { node: CdpNode };
    const matches: CdpNode[] = [];
    const visit = (n: CdpNode): void => {
      const attributes = n.attributes ?? [];
      const at = attributes.indexOf('class');
      if (at >= 0 && attributes[at + 1].split(/\s+/).includes(className)) matches.push(n);
      for (const child of n.children ?? []) visit(child);
      for (const shadow of n.shadowRoots ?? []) visit(shadow);
    };
    visit(node);
    const target = matches[index];
    if (!target?.backendNodeId) throw new Error(`No element with class ${className} (index ${index}) in the review`);
    const { model } = (await client.send('DOM.getBoxModel', { backendNodeId: target.backendNodeId })) as {
      model?: { content: number[] };
    };
    const q = model?.content;
    if (!q || q.length < 8) throw new Error('The element has no visible geometry');
    await page.mouse.click((q[0] + q[2] + q[4] + q[6]) / 4, (q[1] + q[3] + q[5] + q[7]) / 4);
  } finally {
    await client.detach();
  }
}
