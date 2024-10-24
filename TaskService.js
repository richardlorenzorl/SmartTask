// TaskService.js
export default function CreateTaskService() {
    // Task CRUD operations
    async function CreateTask(taskData) {
        try {
            ValidateTaskData(taskData);
            
            const task = await $db.Task.Create({
                Title: taskData.title,
                Description: taskData.description,
                Priority: CalculateTaskPriority(taskData),
                DueDate: taskData.dueDate,
                Status: "New",
                AssigneeId: taskData.assigneeId,
                ProjectId: taskData.projectId,
                Metadata: JSON.stringify(taskData.metadata || {})
            });

            await NotifyAssignee(task);
            return task;
        } catch (error) {
            $log.Error("CreateTask failed", error);
            throw new UserException("TaskCreationFailed");
        }
    }

    function CalculateTaskPriority(taskData) {
        const baseScore = taskData.priority || 0;
        const dueDate = new Date(taskData.dueDate);
        const today = new Date();
        const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        
        let priorityScore = baseScore;
        
        // Increase priority for tasks due soon
        if (daysUntilDue <= 1) {
            priorityScore += 20;
        } else if (daysUntilDue <= 3) {
            priorityScore += 10;
        }

        // Consider dependencies
        if (taskData.dependencies && taskData.dependencies.length > 0) {
            priorityScore += 5;
        }

        return Math.min(Math.max(priorityScore, 0), 100);
    }

    async function UpdateTaskStatus(taskId, newStatus, userId) {
        try {
            const task = await $db.Task.FindById(taskId);
            if (!task) {
                throw new UserException("TaskNotFound");
            }

            // Verify user has permission
            if (!await HasTaskPermission(userId, taskId)) {
                throw new UserException("InsufficientPermissions");
            }

            const updatedTask = await $db.Task.Update(taskId, {
                Status: newStatus,
                ModifiedAt: new Date()
            });

            await NotifyTaskUpdate(updatedTask);
            return updatedTask;
        } catch (error) {
            $log.Error("UpdateTaskStatus failed", error);
            throw new UserException("TaskUpdateFailed");
        }
    }

    async function GetUserTasks(userId, filters = {}) {
        try {
            const query = $db.Task.CreateQuery()
                .Where("AssigneeId", userId)
                .OrderBy("Priority", "DESC")
                .OrderBy("DueDate", "ASC");

            if (filters.status) {
                query.Where("Status", filters.status);
            }
            
            if (filters.projectId) {
                query.Where("ProjectId", filters.projectId);
            }

            return await query.Execute();
        } catch (error) {
            $log.Error("GetUserTasks failed", error);
            throw new UserException("TaskRetrievalFailed");
        }
    }

    return {
        CreateTask,
        UpdateTaskStatus,
        GetUserTasks,
        CalculateTaskPriority
    };
}
