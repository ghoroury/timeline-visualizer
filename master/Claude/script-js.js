document.addEventListener('DOMContentLoaded', function() {

    // DOM elements
    const fileInput = document.getElementById('file-input');
    const fileSelectBtn = document.getElementById('file-select-btn');
    const uploadArea = document.getElementById('upload-area');
    const exportBtn = document.getElementById('export-btn');
    const snapGridBtn = document.getElementById('snap-grid-btn');
    const timelineContainer = document.getElementById('timeline');
    const loadingEl = document.getElementById('loading');
    const errorModal = document.getElementById('errorModal');
    const errorMessage = document.getElementById('errorMessage');
    const closeModal = document.querySelector('.close');

    // Global variables
    let timelineData = null;
    let snapToGrid = false;
    const gridSize = 20;
    const yearWidth = 200; // Width of each year column in pixels
    const quarterWidth = 50;
    const rowHeight = 65;

    const currentDate = new Date();
    let firstYear = currentDate.getFullYear(); // Start from today's date
    let lastYear = firstYear + 5; // Default 5-year range

    const equipmentLabelWidth = 50;
    const yearHeaderHeight = 25;

    // Event listeners
    fileSelectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    // exportBtn.addEventListener('click', exportAsSVG);
    snapGridBtn.addEventListener('click', toggleSnapToGrid);
    closeModal.addEventListener('click', () => errorModal.style.display = 'none');

    // Functions
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileUpload();
        }
    }

    function initDragAndDrop() {
          interact('.rectangle').draggable({
              inertia: false,
              modifiers: [
                  interact.modifiers.restrictRect({
                      restriction: 'parent',
                      endOnly: true
                  })
              ],
              autoScroll: true,
              listeners: {
                  move: dragMoveListener,
                  end: function (event) {
                      // Update the position attributes
                      const target = event.target;
                      target.dataset.x = parseFloat(target.style.left);
                      target.dataset.y = parseFloat(target.style.top);

                      // Update connections if this is a connected rectangle
                      updateConnections();
                  }
              }
          });
      }

    function dragMoveListener(event) {
        const target = event.target;
        let x = parseFloat(target.dataset.x || 0) + event.dx;
        let y = parseFloat(target.dataset.y || 0) + event.dy;

        // Snap to grid if enabled
        if (snapToGrid) {
            x = Math.round(x / gridSize) * gridSize;
            y = Math.round(y / gridSize) * gridSize;
        }

        // Update the element's position
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;

        // Update the data attributes
        target.dataset.x = x;
        target.dataset.y = y;
    }

    function toggleSnapToGrid() {
        snapToGrid = !snapToGrid;
        snapGridBtn.textContent = snapToGrid ? 'Disable Snap to Grid' : 'Enable Snap to Grid';
    }

    function handleFileUpload() {
        const file = fileInput.files[0];
        if (!file) return;

        const validExtensions = ['.xlsx'];
        const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

        if (!validExtensions.includes(fileExt)) {
            showError('Please upload a valid Excel file (.xlsx)');
            return;
        }

        loadingEl.style.display = 'flex';

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                if (validateData(jsonData)) {
                    timelineData = processData(jsonData);
                    renderTimeline();
                    exportBtn.disabled = false;
                    snapGridBtn.disabled = false;
                }
            } catch (err) {
                showError('Failed to parse the Excel file. Please make sure it contains valid data.');
                console.error(err);
            } finally {
                loadingEl.style.display = 'none';
            }
        };

        reader.onerror = function() {
            loadingEl.style.display = 'none';
            showError('Failed to read the file. Please try again.');
        };

        reader.readAsArrayBuffer(file);
    }

    function validateData(jsonData) {
          // Make sure we have header row and at least one data row
          if (jsonData.length < 2) {
              showError('The Excel file does not contain enough data. Please make sure it has headers and at least one data row.');
              return false;
          }

          // Check for required columns
          const headers = jsonData[0];
          const requiredColumns = [
              'Equipment Name',
              'Equipment Serial Number',
              'Equipment Short Name',
              'Current FFH',
              'Source Serial Number',
              'Outage Date',
              'Type of Outage',
              'Rotor End of Life Window Start',
              'Rotor End of Life Window End',
              'Type of Rotor Life Extension Applied'
          ];

          // Simplified validation - just check if there are enough columns
          if (headers.length < requiredColumns.length) {
              showError('The Excel file does not contain all the required columns.');
              return false;
          }

          return true;
      }

    function processData(jsonData) {
          const headers = jsonData[0];
          const data = [];

          // Map column indices
          const columnMap = {
              equipmentSerial: headers.indexOf('Equipment Serial Number'),
              equipmentShortName: headers.indexOf('Equipment Short name'),
              equipmentffh:headers.indexOf('Current FFH'),
              sourceSerial: headers.indexOf('Source Serial number'),
              outageDate: headers.indexOf('Outage Date'),
              outageType: headers.indexOf('Type of Outage'),
              endOfLifeDateStart: headers.indexOf('Rotor End of Life Window Start'),
              endOfLifeDateEnd: headers.indexOf('Rotor End of life window end'),
              extensionType: headers.indexOf('Type of Rotor Life Extension Applied')
          };

          // Default to probable indices if not found
          Object.keys(columnMap).forEach(key => {
              if (columnMap[key] === -1) {
                  columnMap[key] = Object.keys(columnMap).indexOf(key);
              }
          });

          for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (row.length > 0) {
                  const item = {
                      equipmentSerial: row[columnMap.equipmentSerial] || `Equipment-${i}`,
                      equipmentShortName: row[columnMap.equipmentShortName] || `GT${i}`,
                      sourceSerial: row[columnMap.sourceSerial] || '',
                      outageDate: parseDate(row[columnMap.outageDate]),
                      outageType: row[columnMap.outageType] || 'Inspection',
                      equipmentffh: row[columnMap.equipmentffh] || '',
                      endOfLifeDateStart: parseDate(row[columnMap.endOfLifeDateStart]),
                      endOfLifeDateEnd: parseDate(row[columnMap.endOfLifeDateEnd]),
                      extensionType: row[columnMap.extensionType] || ''
                  };
                  data.push(item);
              }
          }

          return data;
      }

    function parseDate(dateValue) {
          if (!dateValue) return null;

          // Try to parse an Excel date (number)
          if (typeof dateValue === 'number') {
              // Excel dates are days since 1/1/1900
              const excelEpoch = new Date(1900, 0, 1);
              const date = new Date(excelEpoch);
              date.setDate(excelEpoch.getDate() + dateValue - 2); // -2 because Excel has a bug with leap years
              return date;
          }

          // Try to parse a date string
          const date = new Date(dateValue);
          if (!isNaN(date.getTime())) {
              return date;
          }

          return null;
      }

    function createRectangle(colorClass, text, left, top, width, height) {
        const rect = document.createElement('div');
        rect.className = `rectangle ${colorClass}`;
        rect.innerHTML = text;
        rect.style.left = `${left}px`;
        rect.style.top = `${top}px`;
        rect.style.width = `${width}px`;
        rect.style.height = `${height}px`;
        rect.dataset.x = left;
        rect.dataset.y = top;
        rect.dataset.width = width;
        rect.dataset.height = height;

        return rect;
    }

    function renderTimeline() {
        timelineContainer.innerHTML = '';
        connections = [];

        // Set default year range if not already detected from data
        if (timelineData && timelineData.length > 0) {
            // Try to determine years from data
            const allYears = [];
            timelineData.forEach(item => {
                if (item.outageDate) {
                    allYears.push(item.outageDate.getFullYear());
                }
                if (item.endOfLifeDateEnd) {
                    allYears.push(item.endOfLifeDateEnd.getFullYear());
                }
                if (item.endOfLifeDateStart) {
                    allYears.push(item.endOfLifeDateStart.getFullYear());
                }
            });

            if (allYears.length > 0) {
                // Use current year as the starting point if all data is in the past
                const minYear = Math.min(...allYears);
                firstYear = Math.max(currentDate.getFullYear(), minYear);

                // Ensure we have enough years to show all data
                const maxYear = Math.max(...allYears);
                lastYear = Math.max(maxYear + 1, firstYear + 5);
            }
        }

        // Create year headers
        const yearsHeader = document.createElement('div');
        yearsHeader.style.position = 'relative';
        yearsHeader.style.height = `${yearHeaderHeight}px`;
        yearsHeader.style.marginLeft = `${equipmentLabelWidth}px`;

        for (let year = firstYear; year <= lastYear; year++) {
            const yearMarker = document.createElement('div');
            yearMarker.className = 'year-marker';
            yearMarker.style.left = `${(year - firstYear) * yearWidth}px`;
            yearMarker.style.top = '10px';
            yearMarker.textContent = year;
            yearsHeader.appendChild(yearMarker);

            for(let quarter = 0; quarter<=3; quarter++){
              const quarterMarker = document.createElement('div');
              quarterMarker.className = 'quarter-marker';
              quarterMarker.style.left = `${((year - firstYear) * yearWidth)+ ((quarter)* quarterWidth)}px`;
              quarterMarker.style.top = '9px';
              quarterMarker.textContent = quarter+1;
              yearsHeader.appendChild(quarterMarker);
            }
        }

        timelineContainer.appendChild(yearsHeader);

        // Group data by equipment serial number
        const equipmentGroups = {};
        timelineData.forEach(item => {
            if (!equipmentGroups[item.equipmentSerial]) {
                equipmentGroups[item.equipmentSerial] = [];
            }
            equipmentGroups[item.equipmentSerial].push(item);
        });

        // Create horizontal dotted lines for each row
        const totalWidth = (lastYear - firstYear + 1) * yearWidth + equipmentLabelWidth + 100;

        // Create equipment rows
        let rowIndex = 0;
        for (const [equipmentSerial, items] of Object.entries(equipmentGroups)) {
            const item = items[0]; // Use first item for equipment details

            const rowTop = (yearHeaderHeight + rowIndex * rowHeight);

            const equipmentRow = document.createElement('div');
            equipmentRow.className = 'equipment-row';
            equipmentRow.style.top = `${rowTop -(rowHeight*rowIndex)}px`;
            equipmentRow.style.width = `${totalWidth}px`;

            // Add horizontal line
            // const horizontalLine = document.createElement('div');
            // horizontalLine.className = 'horizontal-line';
            // horizontalLine.style.top = `${rowTop + rowHeight}px`;
            // timelineContainer.appendChild(horizontalLine);

            // Create equipment label (blue rectangle on left)
            const equipmentLabel = document.createElement('div');
            equipmentLabel.className = 'equipment-label';
            equipmentLabel.innerHTML = `${item.equipmentShortName}<br>${item.equipmentffh/1000}K`;
            equipmentRow.appendChild(equipmentLabel);

            // Process outage events
            items.forEach(item => {
                if (item.outageDate) {
                    const outageYear = item.outageDate.getFullYear();
                    const month = item.outageDate.toLocaleString('default', { month: 'short' });
                    const outageLabel = `${item.outageType}<br>${month}-${outageYear.toString().substr(2)}`;
                    // Calculate the quarter of the year.
                    const outage_month = (item.outageDate.getMonth())
                    const outage_quarter = Math.ceil(outage_month/3);
                    // Create Red Rectangle for End of Life
                    if (item.endOfLifeDateEnd) {
                        const endOfLifeYear = item.endOfLifeDateEnd.getFullYear();
                        const redRectX = equipmentLabelWidth + (endOfLifeYear - firstYear) * yearWidth +20+ (outage_quarter*50)+outage_month;
                        const redRectY = rowTop + rowHeight+5 + ((rowHeight-50)*rowIndex);
                        const redRect = createRectangle('red', '144K', redRectX, redRectY, 30, 15);
                        timelineContainer.appendChild(redRect);
                    }
                    // Create green rectangle for outage
                    const greenRectX = equipmentLabelWidth + (outageYear - firstYear) * yearWidth +20+ (outage_quarter*50);
                    const greenRectY = rowTop + rowHeight + ((rowHeight-50)*rowIndex);
                    const greenRect = createRectangle('green', outageLabel, greenRectX, greenRectY, 40, 30);
                    greenRect.dataset.equipmentSerial = item.equipmentSerial;
                    greenRect.dataset.id = `outage_${item.equipmentSerial}_${outageYear}`;
                    timelineContainer.appendChild(greenRect);


                    // Check if this is a "Seed" outage (with no source)
                    if (!item.sourceSerial && item.extensionType && item.extensionType !== 'RLE') {
                        const seedRect = createRectangle('grey seed', 'Seed', greenRectX - 49, greenRectY, 30, 30);
                        timelineContainer.appendChild(seedRect);
                    }
                }


            });

            timelineContainer.appendChild(equipmentRow);
            rowIndex++;
        }
        //
        // Create connections between equipment based on source serial numbers
        timelineData.forEach(item => {
            if (item.sourceSerial && item.outageDate && equipmentGroups[item.sourceSerial]) {
                // Find the source item
                const sourceItems = equipmentGroups[item.sourceSerial];
                const sourceItem = sourceItems.find(si => si.outageDate);

                if (sourceItem && sourceItem.outageDate) {
                    const sourceYear = sourceItem.outageDate.getFullYear();
                    const targetYear = item.outageDate.getFullYear();

                    const sourceRectId = `outage_${sourceItem.equipmentSerial}_${sourceYear}`;
                    const targetRectId = `outage_${item.equipmentSerial}_${targetYear}`;

                    createConnection(sourceRectId, targetRectId);
                }
            }
        });
        //
        // Set the timeline container size
        timelineContainer.style.minWidth = `${totalWidth}px`;
        timelineContainer.style.minHeight = `${yearHeaderHeight + rowIndex * rowHeight + 50}px`;
        //
        // Initialize the drag-and-drop functionality
        initDragAndDrop();
    }

    function createConnection(sourceId, targetId) {
        const sourceRect = document.querySelector(`[data-id="${sourceId}"]`);
        const targetRect = document.querySelector(`[data-id="${targetId}"]`);

        if (!sourceRect || !targetRect) return;

        const connectionId = `connection_${sourceId}_${targetId}`;
        const connection = {
            id: connectionId,
            sourceId: sourceId,
            targetId: targetId
        };

        connections.push(connection);
        drawConnection(connection);
    }

    function drawConnection(connection) {
        // Remove any existing connection with this ID
        const existingConnection = document.getElementById(connection.id);
        if (existingConnection) {
            existingConnection.remove();
        }

        const sourceRect = document.querySelector(`[data-id="${connection.sourceId}"]`);
        const targetRect = document.querySelector(`[data-id="${connection.targetId}"]`);

        if (!sourceRect || !targetRect) return;

        // Get source and target positions
        const sourceX = parseFloat(sourceRect.style.left) + parseFloat(sourceRect.dataset.width);
        const sourceY = parseFloat(sourceRect.style.top) + parseFloat(sourceRect.dataset.height) / 2;
        const targetX = parseFloat(targetRect.style.left);
        const targetY = parseFloat(targetRect.style.top) + parseFloat(targetRect.dataset.height) / 2;

        // Calculate midpoint
        const midX = (sourceX + targetX) / 2;

        // Create container for all connection parts
        const connectionContainer = document.createElement('div');
        connectionContainer.id = connection.id;
        connectionContainer.className = 'connection-container';
        // connectionContainer.style.position = 'absolute';
        connectionContainer.style.zIndex = '5';

        // 1. Horizontal line from source to midpoint
        const line1 = document.createElement('div');
        line1.className = 'connector connector-horizontal';
        line1.style.left = `${sourceX+16}px`;
        line1.style.top = `${sourceY}px`;
        line1.style.width = `${midX - sourceX-16}px`;
        connectionContainer.appendChild(line1);

        // 2. Vertical line at midpoint
        const line2 = document.createElement('div');
        line2.className = 'connector connector-vertical';
        line2.style.left = `${midX}px`;
        line2.style.top = sourceY < targetY ? `${sourceY}px` : `${targetY}px`;
        line2.style.height = `${Math.abs(targetY - sourceY)}px`;
        connectionContainer.appendChild(line2);

        // 3. Horizontal line from midpoint to target
        const line3 = document.createElement('div');
        line3.className = 'connector connector-horizontal';
        line3.style.left = `${midX}px`;
        line3.style.top = `${targetY}px`;
        line3.style.width = `${targetX - midX}px`;
        connectionContainer.appendChild(line3);

        // Create RLE label in the middle of the vertical line
        const rleRect = document.createElement('div');
        rleRect.className = 'rectangle grey';
        rleRect.textContent = 'RLE';
        rleRect.style.left = `${midX - 25}px`;
        rleRect.style.top = `${(sourceY + targetY) / 2 - 15}px`;
        rleRect.style.width = '40px';
        rleRect.style.height = '10px';
        connectionContainer.appendChild(rleRect);

        timelineContainer.appendChild(connectionContainer);
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorModal.style.display = 'block';
    }
});
