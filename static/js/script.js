document.addEventListener('DOMContentLoaded', function () {
    /* ------------------------- NAVEGACIÓN ENTRE TABS -------------------------- */
    const tabBtns     = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(btn  => btn.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const id = btn.getAttribute('data-tab');
            document.getElementById(id).classList.add('active');
        });
    });

    /* --------------------------- VARIABLES GLOBALES --------------------------- */
    const conversationsList = document.querySelector('.conversations-list');
    const addConversationBtn = document.getElementById('addConversationBtn');
    const conversationModal  = document.getElementById('conversationModal');
    const closeModalBtns     = document.querySelectorAll('.close-modal');
    const conversationForm   = document.getElementById('conversationForm');
    const addTurnBtn         = document.getElementById('addTurnBtn');
    const conversationTurns  = document.getElementById('conversationTurns');

    /* --- Modal de confirmación --- */
    const confirmModal      = document.getElementById('confirmModal');
    const confirmDeleteBtn  = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn   = document.getElementById('cancelDeleteBtn');
    let conversationToDelete = null;

    /* --- Entrenamiento --- */
    const startTrainingBtn   = document.getElementById('startTrainingBtn');
    const trainingStatus     = document.getElementById('trainingStatus');
    const trainingProgress   = document.getElementById('trainingProgress');
    const progressPercentage = document.getElementById('progressPercentage');
    const logsContainer      = document.getElementById('logsContainer');
    let   trainingStatusInterval = null;

    /* --- Pruebas de chat --- */
    const chatBox    = document.getElementById('chatBox');
    const chatForm   = document.getElementById('chatForm');
    const userInput  = document.getElementById('userInput');

    /* ======================= CARGAR CONVERSACIONES ========================== */
    loadConversations();

    /* --------------------------- LISTENERS MODAL ----------------------------- */
    addConversationBtn.addEventListener('click', openAddConversationModal);
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            conversationModal.style.display = 'none';
            confirmModal.style.display      = 'none';
        });
    });

    window.addEventListener('click', e => {
        if (e.target === conversationModal) conversationModal.style.display = 'none';
        if (e.target === confirmModal)      confirmModal.style.display      = 'none';
    });

    addTurnBtn.addEventListener('click', () => addTurnToForm());

    conversationForm.addEventListener('submit', handleFormSubmit);
    cancelDeleteBtn.addEventListener('click', () => {
        confirmModal.style.display = 'none';
        conversationToDelete = null;
    });
    confirmDeleteBtn.addEventListener('click', deleteConversation);

    startTrainingBtn.addEventListener('click', startTraining);
    chatForm.addEventListener('submit', handleChat);

    /* ======================= FUNCIONES DATASET ============================== */

    function loadConversations() {
        conversationsList.innerHTML =
            '<div class="loading">Cargando conversaciones…</div>';

        fetch('/api/dataset')
            .then(r => r.json())
            .then(data => {
                if (data.length === 0) {
                    conversationsList.innerHTML =
                        '<div class="empty-dataset">No se encontraron conversaciones. Haz clic en «Agregar conversación» para crear una.</div>';
                } else {
                    renderConversations(data);
                }
            })
            .catch(err => {
                console.error('Error al cargar conversaciones:', err);
                conversationsList.innerHTML =
                    `<div class="error-message">Error al cargar conversaciones: ${err.message}</div>`;
            });
    }

    function renderConversations(conversations) {
        conversationsList.innerHTML = '';

        conversations.forEach((convo, index) => {
            const card   = document.createElement('div');
            card.className = 'conversation-card fade-in';

            const header = document.createElement('div');
            header.className = 'conversation-header';

            const title  = document.createElement('div');
            title.className = 'conversation-title';
            title.textContent = `Conversación ${index + 1}`;

            const actions = document.createElement('div');
            actions.className = 'conversation-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn edit';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.title     = 'Editar conversación';
            editBtn.addEventListener('click',
                () => openEditConversationModal(convo, index));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title     = 'Borrar conversación';
            deleteBtn.addEventListener('click',
                () => confirmDeleteConversation(index));

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            header.appendChild(title);
            header.appendChild(actions);

            const turns = document.createElement('div');
            turns.className = 'conversation-turns';

            convo.conversation.forEach(turn => {
                const turnDiv = document.createElement('div');
                turnDiv.className = `turn ${turn.role === 'user' ? 'user' : 'assistant'}`;

                const roleDiv = document.createElement('div');
                roleDiv.className = 'turn-role';
                roleDiv.textContent = turn.role === 'user' ? 'Usuario:' : 'Asistente:';

                const contentDiv = document.createElement('div');
                contentDiv.className = 'turn-content';
                contentDiv.textContent = turn.content;

                turnDiv.appendChild(roleDiv);
                turnDiv.appendChild(contentDiv);
                turns.appendChild(turnDiv);
            });

            card.appendChild(header);
            card.appendChild(turns);
            conversationsList.appendChild(card);
        });
    }

    /* -------------------------- MODAL – AÑADIR / EDITAR ---------------------- */
    function openAddConversationModal() {
        document.getElementById('modalTitle').textContent = 'Agregar nueva conversación';
        document.getElementById('conversationId').value   = '';
        conversationTurns.innerHTML = '';

        addTurnToForm('user');
        addTurnToForm('assistant');

        conversationModal.style.display = 'block';
    }

    function openEditConversationModal(conversation, index) {
        document.getElementById('modalTitle').textContent = 'Editar conversación';
        document.getElementById('conversationId').value   = index;
        conversationTurns.innerHTML = '';

        conversation.conversation.forEach(turn =>
            addTurnToForm(turn.role, turn.content));

        conversationModal.style.display = 'block';
    }

    function addTurnToForm(role = 'user', content = '') {
        const i = document.querySelectorAll('.turn-form').length;

        const turnForm = document.createElement('div');
        turnForm.className = 'turn-form fade-in';

        /* --- cabecera --- */
        const turnHeader = document.createElement('div');
        turnHeader.className = 'turn-form-header';

        const turnTitle = document.createElement('div');
        turnTitle.className = 'turn-form-title';
        turnTitle.textContent = `Turno ${i + 1}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-turn-btn';
        removeBtn.type = 'button';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', () => {
            turnForm.remove();
            updateTurnNumbers();
        });

        turnHeader.appendChild(turnTitle);
        turnHeader.appendChild(removeBtn);

        /* --- rol --- */
        const roleGroup = document.createElement('div');
        roleGroup.className = 'form-group';

        const roleLabel = document.createElement('label');
        roleLabel.textContent = 'Rol:';
        roleLabel.setAttribute('for', `role-${i}`);

        const roleSelect = document.createElement('select');
        roleSelect.name = 'role';
        roleSelect.id   = `role-${i}`;
        roleSelect.required = true;

        const userOption = document.createElement('option');
        userOption.value = 'user';
        userOption.textContent = 'Usuario';
        userOption.selected = role === 'user';

        const assistantOption = document.createElement('option');
        assistantOption.value = 'assistant';
        assistantOption.textContent = 'Asistente';
        assistantOption.selected = role === 'assistant';

        roleSelect.appendChild(userOption);
        roleSelect.appendChild(assistantOption);

        roleGroup.appendChild(roleLabel);
        roleGroup.appendChild(roleSelect);

        /* --- contenido --- */
        const contentGroup = document.createElement('div');
        contentGroup.className = 'form-group';

        const contentLabel = document.createElement('label');
        contentLabel.textContent = 'Contenido:';
        contentLabel.setAttribute('for', `content-${i}`);

        const contentTextarea = document.createElement('textarea');
        contentTextarea.name = 'content';
        contentTextarea.id   = `content-${i}`;
        contentTextarea.required = true;
        contentTextarea.value = content;

        contentGroup.appendChild(contentLabel);
        contentGroup.appendChild(contentTextarea);

        /* --- ensamblar --- */
        turnForm.appendChild(turnHeader);
        turnForm.appendChild(roleGroup);
        turnForm.appendChild(contentGroup);

        conversationTurns.appendChild(turnForm);
    }

    function updateTurnNumbers() {
        document.querySelectorAll('.turn-form-title').forEach((el, i) =>
            el.textContent = `Turno ${i + 1}`);
    }

    /* -------------------------- SUBMIT FORMULARIO --------------------------- */
    function handleFormSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('conversationId').value;
        const turnForms = document.querySelectorAll('.turn-form');
        const conversation = { conversation: [] };

        turnForms.forEach(t => {
            const role    = t.querySelector('select[name="role"]').value;
            const content = t.querySelector('textarea[name="content"]').value;
            conversation.conversation.push({ role, content });
        });

        const method = id === '' ? 'POST' : 'PUT';
        const url    = id === '' ? '/api/dataset' : `/api/dataset/${id}`;

        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conversation)
        })
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                conversationModal.style.display = 'none';
                loadConversations();
            })
            .catch(err => {
                console.error('Error al guardar conversación:', err);
                alert(`Error al guardar conversación: ${err.message}`);
            });
    }

    /* -------------------------- BORRAR CONVERSACIÓN ------------------------- */
    function confirmDeleteConversation(index) {
        conversationToDelete = index;
        confirmModal.style.display = 'block';
    }

    function deleteConversation() {
        if (conversationToDelete === null) return;

        fetch(`/api/dataset/${conversationToDelete}`, { method: 'DELETE' })
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                confirmModal.style.display = 'none';
                conversationToDelete = null;
                loadConversations();
            })
            .catch(err => {
                console.error('Error al borrar conversación:', err);
                alert(`Error al borrar conversación: ${err.message}`);
            });
    }

    /* ======================= FUNCIONES DE ENTRENAMIENTO ===================== */
    function startTraining() {
        fetch('/api/train', { method: 'POST' })
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);

                startTrainingBtn.disabled = true;
                startTrainingBtn.textContent = 'Entrenando…';

                if (trainingStatusInterval) clearInterval(trainingStatusInterval);
                trainingStatusInterval = setInterval(checkTrainingStatus, 1000);
            })
            .catch(err => {
                console.error('Error al iniciar entrenamiento:', err);
                alert(`Error al iniciar entrenamiento: ${err.message}`);
            });
    }

    function checkTrainingStatus() {
        fetch('/api/training-status')
            .then(r => r.json())
            .then(data => {
                trainingStatus.textContent   = data.status;
                trainingProgress.style.width = `${data.progress}%`;
                progressPercentage.textContent = `${data.progress}%`;

                logsContainer.innerHTML = '';
                data.logs.forEach(log => {
                    const div = document.createElement('div');
                    div.className = 'log-entry';
                    div.textContent = log;
                    logsContainer.appendChild(div);
                });
                logsContainer.scrollTop = logsContainer.scrollHeight;

                if (!data.inProgress) {
                    clearInterval(trainingStatusInterval);
                    startTrainingBtn.disabled = false;
                    startTrainingBtn.textContent = 'Iniciar entrenamiento';
                }
            })
            .catch(err => {
                console.error('Error al consultar estado de entrenamiento:', err);
                clearInterval(trainingStatusInterval);
                startTrainingBtn.disabled = false;
                startTrainingBtn.textContent = 'Iniciar entrenamiento';
            });
    }

    /* ======================= FUNCIONES DE PRUEBA DE CHAT ==================== */
    function handleChat(e) {
        e.preventDefault();

        const msg = userInput.value.trim();
        if (!msg) return;

        addMessageToChat('user', msg);
        userInput.value = '';

        const typing = document.createElement('div');
        typing.className = 'typing-indicator';
        typing.innerHTML = '<span></span><span></span><span></span>';
        chatBox.appendChild(typing);
        chatBox.scrollTop = chatBox.scrollHeight;

        fetch('/api/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: msg })
        })
            .then(r => r.json())
            .then(data => {
                typing.remove();
                if (data.error) throw new Error(data.error);
                addMessageToChat('assistant', data.response);
            })
            .catch(err => {
                typing.remove();
                console.error('Error al enviar mensaje:', err);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = `Error: ${err.message}`;
                chatBox.appendChild(errorDiv);
            });
    }

    function addMessageToChat(role, msg) {
        const welcome = document.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        const div = document.createElement('div');
        div.className = `chat-message ${role === 'user' ? 'user-message' : 'bot-message'} fade-in`;
        div.textContent = msg;

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});

