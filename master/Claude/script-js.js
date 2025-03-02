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
    let snapToGrid = true;
    const gridSize = 20;
    const yearWidth = 100; // Width of each year column in pixels

    // Use current date to set default start year
    const currentDate = new Date();
    let firstYear = currentDate.getFullYear(); // Start from today's date
    let lastYear = firstYear + 5; // Default 5-year range

    const equipmentLabelWidth = 100;
    const yearHeaderHeight = 25;

    // Store connections for updating
    let connections = [];

    // Event listeners
    fileSelectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    exportBtn.addEventListener('click', exportAsSVG);
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
            'Equipment Serial Number',
            'Equipment Short Name',
            'Source Serial Number',
            'Outage Date',
            'Type of Outage',
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
            equipmentShortName: headers.indexOf('Equipment Short Name'),
            sourceSerial: headers.indexOf('Source Serial Number'),
            outageDate: headers.indexOf('Outage Date'),
            outageType: headers.indexOf('Type of Outage'),
            endOfLifeDate: headers.indexOf('Rotor End of life window end'),
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
                    outageType: row[columnMap.outageType] || 'MI',
                    endOfLifeDate: parseDate(row[columnMap.endOfLifeDate]),
                    extensionType: row[columnMap.extensionType] || ''
                };

                // Extract hours from equipment short name (if format is like "GT11 123K")
                const shortNameParts = item.equipmentShortName.split(' ');
                if (shortNameParts.length > 1) {
                    item.hours = shortNameParts[1];
                    item.equipmentShortName = shortNameParts[0];
                } else {
                    item.hours = (120 + i) + 'K'; // Default value if not provided
                }

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
                if (item.endOfLifeDate) {
                    allYears.push(item.endOfLifeDate.getFullYear());
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

            const rowTop = (yearHeaderHeight + rowIndex * 120);

            const equipmentRow = document.createElement('div');
            equipmentRow.className = 'equipment-row';
            equipmentRow.style.top = `${rowTop -(120*rowIndex)}px`;
            equipmentRow.style.width = `${totalWidth}px`;

            // Add horizontal line
            // const horizontalLine = document.createElement('div');
            // horizontalLine.className = 'horizontal-line';
            // horizontalLine.style.top = `${rowTop + 60}px`;
            // timelineContainer.appendChild(horizontalLine);

            // Create equipment label (blue rectangle on left)
            const equipmentLabel = document.createElement('div');
            equipmentLabel.className = 'equipment-label';
            equipmentLabel.innerHTML = `${item.equipmentShortName}<br>${item.hours}`;
            equipmentRow.appendChild(equipmentLabel);

            // Process outage events
            items.forEach(item => {
                if (item.outageDate) {
                    const outageYear = item.outageDate.getFullYear();
                    const month = item.outageDate.toLocaleString('default', { month: 'short' });
                    const outageLabel = `${item.outageType}<br>${month}-${outageYear.toString().substr(2)}`;

                    // Create green rectangle for outage
                    const greenRectX = equipmentLabelWidth + (outageYear - firstYear) * yearWidth + 20;
                    const greenRectY = rowTop + 50;
                    const greenRect = createRectangle('green', outageLabel, greenRectX, greenRectY, 60, 30);
                    greenRect.dataset.equipmentSerial = item.equipmentSerial;
                    greenRect.dataset.id = `outage_${item.equipmentSerial}_${outageYear}`;
                    timelineContainer.appendChild(greenRect);

                    // Check if this is a "Seed" outage (with no source)
                    if (!item.sourceSerial && item.extensionType && item.extensionType !== 'RLE') {
                        const seedRect = createRectangle('grey seed', 'Seed', greenRectX - 100, greenRectY - 10, 30, 30);
                        timelineContainer.appendChild(seedRect);
                    }
                }

                // Create Red Rectangle for End of Life
                if (item.endOfLifeDate) {
                    const endOfLifeYear = item.endOfLifeDate.getFullYear();
                    const redRectX = equipmentLabelWidth + (endOfLifeYear - firstYear) * yearWidth+50;
                    const redRectY = rowTop + 50;
                    const redRect = createRectangle('red', '144K', redRectX, redRectY, 60, 30);
                    timelineContainer.appendChild(redRect);
                }
            });

            timelineContainer.appendChild(equipmentRow);
            rowIndex++;
        }

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

        // Set the timeline container size
        timelineContainer.style.minWidth = `${totalWidth}px`;
        timelineContainer.style.minHeight = `${yearHeaderHeight + rowIndex * 120 + 50}px`;

        // Initialize the drag-and-drop functionality
        initDragAndDrop();
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
        line1.style.left = `${sourceX}px`;
        line1.style.top = `${sourceY}px`;
        line1.style.width = `${midX - sourceX}px`;
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
        rleRect.style.left = `${midX - 20}px`;
        rleRect.style.top = `${(sourceY + targetY) / 2 - 15}px`;
        rleRect.style.width = '40px';
        rleRect.style.height = '10px';
        connectionContainer.appendChild(rleRect);

        timelineContainer.appendChild(connectionContainer);
    }

    function updateConnections() {
        connections.forEach(connection => {
            drawConnection(connection);
        });
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

    function exportAsSVG() {
        loadingEl.style.display = 'flex';

        try {
            // Create SVG element
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");

            // Get the dimensions of the timeline
            const timelineWidth = timelineContainer.scrollWidth;
            const timelineHeight = timelineContainer.scrollHeight;
            svg.setAttribute("width", timelineWidth);
            svg.setAttribute("height", timelineHeight);
            svg.setAttribute("viewBox", `0 0 ${timelineWidth} ${timelineHeight}`);

            // Apply white background
            const background = document.createElementNS(svgNS, "rect");
            background.setAttribute("width", "100%");
            background.setAttribute("height", "100%");
            background.setAttribute("fill", "white");
            svg.appendChild(background);

            // Function to create SVG text with line breaks
            function createSVGTextWithBreaks(container, text, x, y, fontSize, fontWeight, fill) {
                const textElement = document.createElementNS(svgNS, "text");
                textElement.setAttribute("x", x);
                textElement.setAttribute("y", y);
                textElement.setAttribute("font-size", fontSize);
                textElement.setAttribute("font-weight", fontWeight || "normal");
                textElement.setAttribute("fill", fill || "black");
                textElement.setAttribute("text-anchor", "middle");

                const lines = text.split("<br>");
                lines.forEach((line, index) => {
                    const tspan = document.createElementNS(svgNS, "tspan");
                    tspan.setAttribute("x", x);
                    tspan.setAttribute("dy", index === 0 ? "0" : "1.2em");
                    tspan.textContent = line;
                    textElement.appendChild(tspan);
                });

                container.appendChild(textElement);
            }

            // Add year headers
            for (let year = firstYear; year <= lastYear; year++) {
                const x = equipmentLabelWidth + (year - firstYear) * yearWidth + yearWidth/2;
                const y = 15;

                // Add year text with dotted line
                const yearLine = document.createElementNS(svgNS, "line");
                yearLine.setAttribute("x1", equipmentLabelWidth + (year - firstYear) * yearWidth);
                yearLine.setAttribute("y1", 0);
                yearLine.setAttribute("x2", equipmentLabelWidth + (year - firstYear) * yearWidth);
                yearLine.setAttribute("y2", timelineHeight);
                yearLine.setAttribute("stroke", "#ccc");
                yearLine.setAttribute("stroke-dasharray", "3,3");
                svg.appendChild(yearLine);

                // Year text
                createSVGTextWithBreaks(svg, year.toString(), x, y, "12px", "normal", "#777");
            }

            // Add horizontal lines
            document.querySelectorAll('.horizontal-line').forEach(line => {
                const y = parseFloat(line.style.top);
                const horizontalLine = document.createElementNS(svgNS, "line");
                horizontalLine.setAttribute("x1", "0");
                horizontalLine.setAttribute("y1", y);
                horizontalLine.setAttribute("x2", timelineWidth);
                horizontalLine.setAttribute("y2", y);
                horizontalLine.setAttribute("stroke", "#ccc");
                horizontalLine.setAttribute("stroke-dasharray", "4");
                svg.appendChild(horizontalLine);
            });

            // Add equipment labels
            document.querySelectorAll('.equipment-label').forEach(label => {
                const x = parseFloat(label.style.left) || 5;
                const y = parseFloat(label.parentElement.style.top) + 15;

                // Equipment label text
                createSVGTextWithBreaks(svg, label.textContent, x + 60, y, "14px", "bold", "#333");
            });

            // Add rectangles (green, red, grey)
            document.querySelectorAll('.rectangle').forEach(rect => {
                if (rect.classList.contains('grey') && !rect.classList.contains('seed') && rect.parentElement && rect.parentElement.classList.contains('connection-container')) {
                    // Skip normal grey rectangles (RLE labels) in connection containers - they'll be added with connections
                    return;
                }

                const x = parseFloat(rect.style.left);
                const y = parseFloat(rect.style.top);
                const width = parseFloat(rect.dataset.width || rect.style.width);
                const height = parseFloat(rect.dataset.height || rect.style.height);

                let svgShape;
                let fillColor;

                if (rect.classList.contains('seed')) {
                    // For seed boxes (arrow shape)
                    svgShape = document.createElementNS(svgNS, "polygon");
                    const points = `${x},${y} ${x + width * 0.75},${y} ${x + width},${y + height/2} ${x + width * 0.75},${y + height} ${x},${y + height}`;
                    svgShape.setAttribute("points", points);
                    fillColor = "#7f8c8d";
                } else {
                    // For regular rectangles
                    svgShape = document.createElementNS(svgNS, "rect");
                    svgShape.setAttribute("x", x);
                    svgShape.setAttribute("y", y);
                    svgShape.setAttribute("width", width);
                    svgShape.setAttribute("height", height);

                    if (rect.classList.contains('red')) {
                        fillColor = "#e74c3c";
                    } else if (rect.classList.contains('green')) {
                        fillColor = "#7bed9f";
                    } else {
                        fillColor = "#7f8c8d";
                    }
                }

                svgShape.setAttribute("fill", fillColor);
                svg.appendChild(svgShape);

                // Add text inside the rectangle
                if (rect.textContent.trim()) {
                    createSVGTextWithBreaks(
                        svg,
                        rect.innerHTML,
                        x + width/2,
                        y + height/2,
                        "14px",
                        "bold",
                        rect.classList.contains('green') ? "black" : "white"
                    );
                }
            });

            // Add connections (grey lines with RLE labels)
            document.querySelectorAll('.connection-container').forEach(container => {
                const connectors = container.querySelectorAll('.connector');

                // Create the path elements for connectors
                connectors.forEach(connector => {
                    const isHorizontal = connector.classList.contains('connector-horizontal');
                    const x = parseFloat(connector.style.left);
                    const y = parseFloat(connector.style.top);
                    const size = isHorizontal ? parseFloat(connector.style.width) : parseFloat(connector.style.height);

                    if (size > 0) {
                        const line = document.createElementNS(svgNS, "line");
                        line.setAttribute("x1", x);
                        line.setAttribute("y1", y);
                        line.setAttribute("x2", isHorizontal ? x + size : x);
                        line.setAttribute("y2", isHorizontal ? y : y + size);
                        line.setAttribute("stroke", "#7f8c8d");
                        line.setAttribute("stroke-width", "4");
                        svg.appendChild(line);
                    }
                });

                // Create the RLE label
                const rleLabel = container.querySelector('.rectangle.grey');
                if (rleLabel) {
                    const x = parseFloat(rleLabel.style.left);
                    const y = parseFloat(rleLabel.style.top);
                    const width = parseFloat(rleLabel.dataset.width || 40);
                    const height = parseFloat(rleLabel.dataset.height || 30);

                    const rleRect = document.createElementNS(svgNS, "rect");
                    rleRect.setAttribute("x", x);
                    rleRect.setAttribute("y", y);
                    rleRect.setAttribute("width", width);
                    rleRect.setAttribute("height", height);
                    rleRect.setAttribute("fill", "#7f8c8d");
                    svg.appendChild(rleRect);

                    // Add RLE text
                    createSVGTextWithBreaks(svg, "RLE", x + width/2, y + height/2, "12px", "bold", "white");
                }
            });

            // Convert SVG to string and download
            const serializer = new XMLSerializer();
            const svgString = serializer.serializeToString(svg);
            const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
            const svgUrl = URL.createObjectURL(svgBlob);

            const downloadLink = document.createElement('a');
            downloadLink.href = svgUrl;
            downloadLink.download = 'timeline_visualization.svg';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            loadingEl.style.display = 'none';
        } catch (error) {
            console.error('SVG export failed:', error);
            showError('Failed to export the SVG. Please try again.');
            loadingEl.style.display = 'none';
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorModal.style.display = 'block';
    }
});
