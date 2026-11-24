document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.ok) return;

  let buildings = [], rooms = [];
  const buildingSelect = $('#campusBuilding');
  const floorSelect = $('#campusFloor');

  function getBuilding(name) {
    return buildings.find(building => building.name === name);
  }

  function selectBuilding(name) {
    if (!getBuilding(name)) return;
    buildingSelect.value = name;
    renderBuilding();
  }

  function renderBuildingList() {
    const selected = buildingSelect.value;
    $('#buildingList').innerHTML = buildings.map(building => `
      <button type="button" class="building-pick ${building.name === selected ? 'selected' : ''}" data-building="${esc(building.name)}">
        <span>${building.number ? `Building ${building.number}` : 'Other rooms'}</span>
        <b>${esc(building.displayName || building.name)}</b>
      </button>`).join('');
    $$('.building-pick').forEach(button => button.onclick = () => selectBuilding(button.dataset.building));
  }

  function renderFloor() {
    const building = getBuilding(buildingSelect.value);
    const floor = floorSelect.value;
    if (!building || !floor) {
      $('#floorPlan').innerHTML = '<div class="empty">Choose a floor to see its rooms.</div>';
      return;
    }

    const floorRooms = rooms
      .filter(room => room.building === building.name && (room.floor || 'Unassigned floor') === floor)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!floorRooms.length) {
      $('#floorPlan').innerHTML = '<div class="empty">No rooms are recorded on this floor yet. An administrator can add them from Classrooms.</div>';
      return;
    }

    $('#floorPlan').innerHTML = floorRooms.map(room => `
      <button type="button" class="floor-room" data-room-id="${room.id}">
        <span class="floor-room-number">${esc(room.name)}</span>
        <span class="floor-room-type">${esc(room.room_type || 'Classroom')}</span>
        <span class="floor-room-meta">${room.capacity} seats · ${room.is_available && !room.is_sample ? 'Available' : 'Not schedulable'}</span>
        ${room.is_sample ? '<span class="sample-label">Sample · verify first</span>' : ''}
      </button>`).join('');

    $$('.floor-room').forEach(button => {
      button.onclick = () => {
        const room = floorRooms.find(item => item.id === Number(button.dataset.roomId));
        if (!room) return;
        const equipment = room.equipment.map(item => esc(item.name)).join(', ') || 'None listed';
        modal({
          title: room.name,
          body: `<p><b>${esc(building.name)}</b> · ${esc(room.floor || 'Floor not set')}</p>
            <p>${esc(room.room_type || 'Classroom')} · ${room.capacity} seats</p>
            <p>Equipment: ${equipment}</p>
            <p>Status: ${room.is_sample ? 'Sample data — verify with campus before use' : room.is_available ? 'Available for scheduling' : 'Unavailable for scheduling'}</p>`,
          actions: [{ label: 'Close' }]
        });
      };
    });
  }

  function renderBuilding() {
    const building = getBuilding(buildingSelect.value);
    if (!building) return;
    $('#buildingTitle').textContent = building.number
      ? `Building ${building.number} · ${building.displayName || building.name}`
      : building.name;

    const floors = [...new Set(
      rooms.filter(room => room.building === building.name).map(room => room.floor || 'Unassigned floor')
    )];
    const floorOrder = floor => {
      const value = floor.toLowerCase();
      if (value.includes('basement')) return -1;
      if (value.includes('ground')) return 0;
      const ordinal = value.match(/(first|second|third|fourth|fifth)/);
      if (ordinal) return ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(ordinal[1]) + 1;
      const level = value.match(/level\s*(\d+)/);
      return level ? Number(level[1]) : 99;
    };
    floors.sort((a, b) => floorOrder(a) - floorOrder(b) || a.localeCompare(b));
    floorSelect.innerHTML = floors.length
      ? floors.map(floor => `<option value="${esc(floor)}">${esc(floor)}</option>`).join('')
      : '<option value="">No floors recorded</option>';
    floorSelect.disabled = !floors.length;

    const selectedRooms = rooms.filter(room => room.building === building.name);
    const hasSamples = selectedRooms.some(room => room.is_sample);
    $('#floorNotice').classList.toggle('hidden', !hasSamples);
    $('#floorNotice').textContent = 'This building includes illustrative sample rooms. Verify names, locations, capacities, and equipment with campus staff before scheduling.';
    renderBuildingList();
    renderFloor();
  }

  try {
    const [directory, roomList] = await Promise.all([API.get('/rooms/buildings'), API.get('/rooms')]);
    rooms = roomList;
    const mappedNames = new Set(directory.buildings.map(building => building.name));
    const additionalBuildings = [...new Set(rooms.map(room => room.building).filter(name => name && !mappedNames.has(name)))]
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ number: null, name, mapX: null, mapY: null }));
    buildings = [...directory.buildings, ...additionalBuildings];
    buildingSelect.innerHTML = buildings.map(building =>
      `<option value="${esc(building.name)}">${building.number ? `Building ${building.number} · ` : ''}${esc(building.displayName || building.name)}</option>`
    ).join('');
    $('#mapMarkers').innerHTML = directory.buildings
      .filter(building => Number.isFinite(building.mapX) && Number.isFinite(building.mapY))
      .map(building => `<button type="button" class="campus-marker" data-building="${esc(building.name)}"
        style="left:${building.mapX}%;top:${building.mapY}%" aria-label="Select building ${building.number}: ${esc(building.displayName || building.name)}"
        title="Building ${building.number}: ${esc(building.displayName || building.name)}">${building.number}</button>`).join('');
    $$('.campus-marker').forEach(button => button.onclick = () => {
      selectBuilding(button.dataset.building);
      $('#floorBrowser').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    buildingSelect.onchange = renderBuilding;
    floorSelect.onchange = renderFloor;
    renderBuilding();
  } catch (error) {
    $('#floorPlan').innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  }
});
