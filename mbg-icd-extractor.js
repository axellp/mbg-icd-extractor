import { LitElement, html, css } from 'lit';
import { formatNewSCD } from './mbg-format-scd.js';

import '@material/web/dialog/dialog.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/button/text-button.js';

function meinbergFirst(a, b) {
  if (a.toLowerCase().startsWith('meinberg')) return -1;
  if (b.toLowerCase().startsWith('meinberg')) return 1;
  return 0;
}

/** Helper function to extract the communication details about the IED */
function extractCommunication(ied) {
  // fetch the Communication section from the parent SCD file
  const comm = ied.ownerDocument
    .querySelector(':root>Communication')
    ?.cloneNode(true);

  // create an array of ConnectedAP elements NOT related to the requested IED.
  const notConnAPs = Array.from(
    comm.querySelectorAll(
      `ConnectedAP:not([iedName="${ied.getAttribute('name')}"])`,
    ),
  );

  // filter out the elements that are not related to the requested IED
  notConnAPs.forEach(notConnAP => {
    const subnet = notConnAP.closest('SubNetwork');
    subnet.removeChild(notConnAP);
    if (!subnet.querySelector('ConnectedAP')) {
      comm.removeChild(subnet);
    }
  });

  return comm;
}

/** Helper function to extract data type templates used by the IED */
function extractTemplates(ied) {
  const templates = ied.ownerDocument
    .querySelector(':root>DataTypeTemplates')
    ?.cloneNode(true);

  const lnTypes = [];
  Array.from(ied.querySelectorAll('LN0, LN')).forEach(ln => {
    if (!lnTypes.includes(ln.getAttribute('lnType'))) {
      lnTypes.push(ln.getAttribute('lnType'));
    }
  });

  const doTypes = [];
  lnTypes.forEach(ln => {
    const lnType = templates.querySelector(`LNodeType[id="${ln}"]`);
    if (lnType) {
      Array.from(lnType.querySelectorAll('DO')).forEach(doType => {
        if (!doTypes.includes(doType.getAttribute('type'))) {
          doTypes.push(doType.getAttribute('type'));
        }
      });
    }
  });

  const daTypes = [];
  const sdoTypes = [];
  doTypes.forEach(doType => {
    const doTypeElement = templates.querySelector(`DOType[id="${doType}"]`);
    if (doTypeElement) {
      Array.from(doTypeElement.querySelectorAll('DA')).forEach(da => {
        if (
          da.getAttribute('type') &&
          !daTypes.includes(da.getAttribute('type'))
        ) {
          daTypes.push(da.getAttribute('type'));
        }
      });

      Array.from(doTypeElement.querySelectorAll('SDO')).forEach(sdo => {
        if (
          sdo.getAttribute('type') &&
          !sdoTypes.includes(sdo.getAttribute('type')) &&
          !doTypes.includes(sdo.getAttribute('type'))
        ) {
          sdoTypes.push(sdo.getAttribute('type'));
        }
      });
    }
  });

  const bdaTypes = [];
  daTypes.forEach(daType => {
    const daTypeElement = templates.querySelector(`DAType[id="${daType}"]`);
    if (daTypeElement) {
      Array.from(daTypeElement.querySelectorAll('BDA')).forEach(bda => {
        if (
          bda.getAttribute('type') &&
          !bdaTypes.includes(bda.getAttribute('type')) &&
          !daTypes.includes(bda.getAttribute('type'))
        ) {
          bdaTypes.push(bda.getAttribute('type'));
        }
      });
    }
  });

  // combine all found types into one array
  const foundTypes = [
    ...lnTypes,
    ...doTypes,
    ...sdoTypes,
    ...daTypes,
    ...bdaTypes,
  ];

  // remove all types not used by the requested IED
  Array.from(
    templates.querySelectorAll('LNodeType, DOType, DAType, EnumType'),
  ).forEach(element => {
    if (!foundTypes.includes(element.getAttribute('id'))) {
      templates.removeChild(element);
    }
  });

  return templates;
}

/** Helper function to create a doc with the IED and its related information */
function extractIED(ied) {
  const doc = document.implementation.createDocument(
    'http://www.iec.ch/61850/2003/SCL',
    'SCL',
  );

  // append the requested IED and its related information
  doc.documentElement.appendChild(extractCommunication(ied));
  doc.documentElement.appendChild(ied.cloneNode(true));
  doc.documentElement.appendChild(extractTemplates(ied));

  return formatNewSCD(doc);
}

/** Helper function to download a CID file for the requested IED */
function downloadIED(ied) {
  // use blob to handle files of any size
  const extractedIED = extractIED(ied);
  const blob = new Blob([extractedIED], { type: 'application/xml' });
  const blobURL = URL.createObjectURL(blob);

  const hiddenElement = document.createElement('a');
  hiddenElement.href = blobURL;
  hiddenElement.target = '_blank';
  hiddenElement.download = `${ied.getAttribute('name')}.cid`;
  document.body.appendChild(hiddenElement);
  hiddenElement.click();
  document.body.removeChild(hiddenElement);
}

/** Web Component to extract an IED and download it in a separate CID file */
export default class MbgIcdExtractor extends LitElement {
  static properties = {
    doc: {},
  };

  run() {
    this.shadowRoot.querySelector('md-dialog').show();
  }

  render() {
    const iedsByManufacturer = [];
    this.doc?.querySelectorAll(':root > IED').forEach(ied => {
      const manufacturer = ied.getAttribute('manufacturer')
        ? ied.getAttribute('manufacturer')
        : 'Undefined';
      if (!iedsByManufacturer[manufacturer])
        iedsByManufacturer[manufacturer] = [];
      iedsByManufacturer[manufacturer].push(ied);
    });
    const manufacturers = Object.keys(iedsByManufacturer).sort(meinbergFirst);

    return html`
      <md-dialog>
        <div slot="headline">Choose the IED</div>
        <md-list slot="content">
          ${manufacturers.map(
            manufacturer => html`
              <md-list-group>
                <div slot="headline" class="manufacturer">${manufacturer}</div>
                ${iedsByManufacturer[manufacturer].map(
                  ied => html`
                    <md-list-item
                      type="button"
                      @click=${() => downloadIED(ied)}
                    >
                      ${ied.getAttribute('name')}
                    </md-list-item>
                  `,
                )}
              </md-list-group>
            `,
          )}
        </md-list>
        <div slot="actions">
          <md-text-button
            @click=${() => this.shadowRoot.querySelector('md-dialog').close()}
            >Close</md-text-button
          >
        </div>
      </md-dialog>
    `;
  }

  static styles = css`
    * {
      --md-sys-color-surface-container-high: var(--oscd-base2);
      --md-sys-color-surface: var(--oscd-base2);
      --md-sys-color-on-surface: var(--oscd-base01);
      --md-sys-color-primary: var(--oscd-primary);
    }

    div.manufacturer {
      color: var(--oscd-base00);
    }
  `;
}
