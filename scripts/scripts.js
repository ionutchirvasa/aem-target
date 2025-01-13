import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  loadSections,
  loadCSS,
  getMetadata,
  loadSection,
  waitForFirstImage,
} from './aem.js';

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * CUSTOM EDM Code
 *
 */
function initWebSDK(path, config) {
  // Preparing the alloy queue
  if (!window.alloy) {
    // eslint-disable-next-line no-underscore-dangle
    (window.__alloyNS ||= []).push('alloy');
    window.alloy = (...args) => new Promise((resolve, reject) => {
      window.setTimeout(() => {
        window.alloy.q.push([resolve, reject, args]);
      });
    });
    window.alloy.q = [];
  }
  // Loading and configuring the websdk
  return new Promise((resolve) => {
    import(path)
      .then(() => window.alloy('configure', config))
      .then(resolve);
  });
}

function onDecoratedElement(fn) {
  // Apply propositions to all already decorated blocks/sections
  if (document.querySelector('[data-block-status="loaded"],[data-section-status="loaded"]')) {
    fn();
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.target.tagName === 'BODY'
      || m.target.dataset.sectionStatus === 'loaded'
      || m.target.dataset.blockStatus === 'loaded')) {
      fn();
    }
  });
  // Watch sections and blocks being decorated async
  observer.observe(document.querySelector('main'), {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-block-status', 'data-section-status'],
  });
  // Watch anything else added to the body
  observer.observe(document.querySelector('body'), { childList: true });
}

function toCssSelector(selector) {
  return selector.replace(/(\.\S+)?:eq\((\d+)\)/g, (_, clss, i) => `:nth-child(${Number(i) + 1}${clss ? ` of ${clss})` : ''}`);
}

async function getElementForProposition(proposition) {
  const selector = proposition.data.prehidingSelector
    || toCssSelector(proposition.data.selector);
  return document.querySelector(selector);
}

async function getAndApplyRenderDecisions() {
  // Get the decisions, but don't render them automatically
  // so we can hook up into the AEM EDS page load sequence
  const response = await window.alloy('sendEvent', { renderDecisions: true, data: { __adobe: { target: { testParam: 'x' } } } });
  const { propositions } = response;
  onDecoratedElement(async () => {
    await window.alloy('applyPropositions', { propositions });
    // keep track of propositions that were applied
    propositions.forEach((p) => {
      p.items = p.items.filter((i) => i.schema !== 'https://ns.adobe.com/personalization/dom-action' || !getElementForProposition(i));
    });
  });

  // // Reporting is deferred to avoid long tasks
  // window.setTimeout(() => {
  //   // Report shown decisions
  //   window.alloy('sendEvent', {
  //     xdm: {
  //       eventType: 'decisioning.propositionDisplay',
  //       _experience: {
  //         decisioning: { propositions },
  //       },
  //     },
  //   });
  // });
}

const alloyLoadedPromise = initWebSDK('./alloy.js', {
  datastreamId: '3c74afb5-4fab-42a8-aec1-7a60b3f42f83',
  orgId: '906E3A095DC834230A495FD6@AdobeOrg',
  // clickCollectionEnabled: true,
  // clickCollection: {
  //   internalLinkEnabled: true,
  //   downloadLinkEnabled: true,
  //   externalLinkEnabled: true,
  //   eventGroupingEnabled: true,
  //   sessionStorageEnabled: true,
  // },
  // context: ['web', 'device', 'environment', 'placeContext', 'highEntropyUserAgentHints'],
  // debugEnabled: true,
  // defaultConsent: 'pending',
  // downloadLinkQualifier: '.(exe|zip|wav|mp3|mov|mpg|avi|wmv|pdf|doc|docx|xls|xlsx|ppt|pptx)$',
  // edgeBasePath: 'ee',
  // edgeConfigOverrides: { datastreamId: 'bedc9ad6-f1ce-406d-9873-bb998be5974f' },
  // edgeDomain: 'data.example.com',
  // idMigrationEnabled: false,
  // onBeforeEventSend: (content) => {
  //   if (content.xdm.web?.webReferrer) delete content.xdm.web.webReferrer.URL;
  // },
  // onBeforeLinkClickSend: (content) => {
  //   content.xdm.web.webPageDetails.URL = 'https://example.com/current.html';
  // },
  // prehidingStyle: '#container { opacity: 0 !important }',
  // targetMigrationEnabled: true,
  // thirdPartyCookiesEnabled: false,
});
if (getMetadata('target')) {
  alloyLoadedPromise.then(() => {
    getAndApplyRenderDecisions();
  }).catch((e) => {
    console.error('Failed to load Alloy', e);
  });
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');

  if (main) {
    decorateMain(main);
    // wait for alloy to finish loading
    await alloyLoadedPromise;
    // show the LCP block in a dedicated frame to reduce TBT
    await new Promise((res) => {
      window.requestAnimationFrame(async () => {
        // await waitForLCP(LCP_BLOCKS);
        res();
      });
    });

    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
